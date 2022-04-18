import AbstractListener, { BaseEntity } from "./listener";
import { gql } from "graphql-request";
import axios from "axios"

type EventData = {
  buyer: string
  saleID: string
  serialNo: string
}

class Listener extends AbstractListener<EventData> {
  async handleEvent(eventData: BaseEntity & EventData) {
    await axios.post(`https://tcg.world/fdsf/gsdfg/dgfd`, {
      buyer: eventData.buyer,
      sale_id: eventData.saleID,
      transaction: eventData.transactionHash
    })

    console.log({eventData})
  }
  async makeQuery(fromBlock: number) {
      const query = gql`
      {
        buyEntities(first: 1, where:{ blockNumber_gt: ${fromBlock} }) {
          id
          eventName
          buyer
          saleID
          serialNo
          blockNumber
          transactionHash
        }
      }
    `

    const res = await this.execQuery<{buyEntities: (BaseEntity & EventData)[]}>(query)

    return res.buyEntities
  }
}

console.log("----")
new Listener({ 
  apiUrl: "", 
  graphUrl: "https://api.thegraph.com/subgraphs/name/adampetroff/cryptomeda-sale-dev", 
  instanceName: "test-sale", 
  environment: "test", 
  dbConfig: { host: process.env.DBHOST || "", port: Number(process.env.DBPORT), user: process.env.DBUSER || "", password: process.env.DBPASSWORD || "", database: process.env.DBNAME || "" }
})
