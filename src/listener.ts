import sleep from './functions/sleep'
import { request } from 'graphql-request'

import { Client } from "pg";

require("dotenv").config();

export interface BaseEntity {
  blockNumber: string
  transactionHash: string
  id: string
}

export default abstract class AbstractListener<T> {
  apiUrl: string;
  graphUrl: string;
  instanceName: string;
  environment: string;
  appId: string
  db: Client


  constructor(apiUrl: string, graphUrl: string, instanceName: string, environment: string, dbConfig: { host: string, port: number, user: string, password: string, database: string }) {
    this.apiUrl = apiUrl
    this.graphUrl = graphUrl
    this.instanceName = instanceName
    this.environment = environment
    this.appId = `${instanceName} ${environment}`

    this.db = new Client(dbConfig)
    this.db.connect()

    this.log("initialising")

    this._init()
  }

  abstract makeQuery(fromBlock: number): Promise<(BaseEntity & T)[]>;
  abstract handleEvent(eventData: BaseEntity & T): Promise<void>;

  async _init() {
    this.keepRetryingFailedEvents()

    try {
      let cycles = 0
      while(true) {
        await this._getAndHandleEventsFromLatestBlock()
        await sleep(10_000)
        if(cycles % 30 === 0) {
          this.log("still checking for new events")
        }
        cycles += 1
      }
    } catch(e) {
      console.error(e)
      this._init()
    }
  }

  async keepRetryingFailedEvents() {
    try {
      let cycles = 0
      while(true) {
        await this.retryFailedEvents()
        await sleep(75_000)
        if(cycles % 30 === 0) {
          this.log("still retrying failed events")
        }
        cycles += 1
      }
    } catch(e) {
      console.error(e)
      this.keepRetryingFailedEvents()
    }
  }

  async fetchFailedEvents(triesGTE: number, triesLTE: number, lastTryAtLTE: number) {
    const result = await this.db.query<{id: number, tries: number, event_data: BaseEntity & T}>(`
        SELECT id, tries, event_data
        FROM events
        WHERE success = false AND app_id = $1 AND tries <= $2 AND tries >= $3 AND last_try_at <= $4`, 
        [this.appId, triesLTE, triesGTE, new Date(lastTryAtLTE)]
    )
    return result.rows
  }

  async retryFailedEvents() {
    // 2. try after 1 min
    const failedEventsSecondTry = await this.fetchFailedEvents(1, 1, Date.now() - 1000 * 60) 

    for(let i = 0; i < failedEventsSecondTry.length; i++) {
      const item = failedEventsSecondTry[i]
      await this._retryToHandleEvent(item.event_data, { tries: item.tries, id: item.id })
    }

    // 3. try after 30 min
    const failedEventsThirdTry = await this.fetchFailedEvents(2, 2, Date.now() - 1000 * 60 * 30) 

    for(let i = 0; i < failedEventsThirdTry.length; i++) {
      const item = failedEventsThirdTry[i]
      await this._retryToHandleEvent(item.event_data, { tries: item.tries, id: item.id })
    }

    // 4. to 10. try after 1 day
    const failedEventsFourthPlusTry = await this.fetchFailedEvents(3, 10, Date.now() - 1000 * 60 * 60 * 24) 

    for(let i = 0; i < failedEventsFourthPlusTry.length; i++) {
      const item = failedEventsFourthPlusTry[i]
      await this._retryToHandleEvent(item.event_data, { tries: item.tries, id: item.id })
    }
  }

  async _getAndHandleEventsFromBlock(fromBlock: number) {
    const results = await this.makeQuery(fromBlock)

    if(!results.length) {
      return
    }

    for(let i = 0; i < results.length; i++) {
      try {
        await this._handleNewEvent(results[i])
      } catch(e: any) {
        this.log(e.message)
      }
    }
    this.log("batch queried and handled")
  }

  async _getAndHandleEventsFromLatestBlock() {
    const result = await this.db.query<{ block_number: number }>(`SELECT block_number FROM events where app_id = $1 ORDER BY block_number DESC`, [this.appId])
    const blockNumber = result.rows[0] ? result.rows[0].block_number : 0
  
    await this._getAndHandleEventsFromBlock(blockNumber)  
  }

  log(...args: any[]) {
    console.log(`${this.appId}: `, ...args)
  }

  async execQuery<T>(query: string): Promise<T> {  
      return await request<T>(this.graphUrl, query)
  }

  async _wasEventAlreadyHandled(data: BaseEntity & T) {
    const result = await this.db.query(`
        SELECT id
        FROM events
        WHERE transaction_hash = $1 AND block_number = $2 AND event_id = $3 AND app_id = $4 AND success = true`, 
        [data.transactionHash, data.blockNumber, data.id, this.appId]
    )

    return !!result.rowCount
  }

  async _retryToHandleEvent(eventData: BaseEntity & T, triesData: { tries: number, id: number }) {
    const thisTry = triesData.tries + 1
    this.log(`Handling event for the ${thisTry}. time`, eventData)
    
    if(await this._wasEventAlreadyHandled(eventData)) {
      this.log("Skipping already handled event.")
      return 
    }
  
    let success = false

    try {
      await this.handleEvent(eventData)

      success = true
    } catch {
      this.log("Event handling failed")
    }

    await this.db.query(
      `
        UPDATE events SET
          success = $2,
          tries = $3,
          last_try_at = $4
        WHERE id = $1;
      `,
      [triesData.id, success, thisTry, new Date()]
    );
  }

  async _handleNewEvent(eventData: BaseEntity & T) {
    this.log("Handling event", eventData)
    
    if(await this._wasEventAlreadyHandled(eventData)) {
      this.log("Skipping already handled event.")
      return 
    }
  
    let success = false

    try {
      await this.handleEvent(eventData)

      success = true
    } catch {
      this.log("Event handling failed")
    }

    await this.db.query(
      `INSERT INTO events(event_id, block_number, transaction_hash, app_id, success, event_data) VALUES ($1, $2, $3, $4, $5, $6)`,
      [eventData.id, eventData.blockNumber, eventData.transactionHash, this.appId, success, eventData]
    );
  }
}
