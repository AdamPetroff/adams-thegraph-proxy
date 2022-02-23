import AbstractListener, { BaseEntity } from "./listener";
import { gql } from "graphql-request";

type EventData = {
  buyer: string
  saleID: string
  serialNo: string
}

class Listener extends AbstractListener<EventData> {
  async handleEvent(eventData: BaseEntity & EventData) {
    // await axios.post(`${this.apiUrl}/test`, {
    //   buyer: eventData.buyer,
    //   sale_id: eventData.saleID,
    //   transaction: eventData.transactionHash
    // })

    console.log({eventData})
  }
  async makeQuery(fromBlock: number) {
      const query = gql`
      {
        buyEntities(where:{ blockNumber_gt: ${fromBlock} }) {
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
new Listener("", "https://api.thegraph.com/subgraphs/name/adampetroff/cryptomeda-sale-dev", "test-sale", "test", { host: process.env.DBHOST || "", port: Number(process.env.DBPORT), user: process.env.DBUSER || "", password: process.env.DBPASSWORD || "", database: process.env.DBNAME || "" })

module.exports = Listener;