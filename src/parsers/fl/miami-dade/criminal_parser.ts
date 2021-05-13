import AbstractParser from "../../abstract_parser";
import { IPublicRecordProducer } from "../../../models/public_record_producer";
const nameParsingService = require("../../../categories/public_records/consumers/property_appraisers/consumer_dependencies/nameParsingServiceNew");

export default class TrafficParser extends AbstractParser {
  protected count: number;
  protected publicProducer: IPublicRecordProducer;
  protected productId: any;
  protected type: string;

  constructor(publicRecordProducer: IPublicRecordProducer, productId: any) {
    super();
    this.count = 0;
    this.publicProducer = publicRecordProducer;
    this.productId = productId;
    this.type = "";
  }

  public getDelimiter(fileName: string): string {
    if (
      /DLY_NOLLE_PROS_[0-9]+\.TXT/g.test(fileName) ||
      /mly_felconv_[0-9]+\.txt/g.test(fileName) ||
      /mly_cjis_filings_closings_[0-9]+\.txt/g.test(fileName)
    ) {
      return "�";
    } else {
      return "  ";
    }
  }

  public getHeaders(fileName: string): string[] {
    if (/FELONY(_[0-9]+)?\.ASC/g.test(fileName)) {
      this.type = "Felony";
      return [];
    } else if (/NOLLEPRO(_[0-9]+)?\.ASC/g.test(fileName)) {
      this.type = "Nollepro";
      return [];
    } else if (/DLY_NOLLE_PROS_[0-9]+\.TXT/g.test(fileName)) {
      this.type = "Daily_Nollepro";
      return this.getDailyNolleproHeaders();
    } else if (/mly_felconv_[0-9]+\.txt/g.test(fileName)) {
      this.type = "Monthly_Felnoy_Conv";
      return this.getMlyFelConv();
    } else if (/mly_cjis_filings_closings_[0-9]+\.txt/g.test(fileName)) {
      this.type = "Monthly_CJIS_Filling";
      return this.getMlyCJIS();
    } else {
      return [];
    }
  }

  private getDailyNolleproHeaders(): string[] {
    return [
      "caseNumber",
      "lastName",
      "firstName",
      "middleName",
      "partyAddress1",
      "unit",
      "city",
      "state",
      "zip",
    ];
  }

  private getMlyFelConv(): string[] {
    return [
      "lastName",
      "firstName",
      "partyAddress1",
      "",
      "city",
      "state",
      "",
      "",
      "",
    ];
  }

  private getMlyCJIS(): string[] {
    return [
      "citationNumber",
      "idNumber",
      "lastName",
      "firstName",
      "middleName",
      "birthday",
      "race",
      "sex",
      "partyAddress1",
      "",
      "city",
      "state",
      "zip",
      "",
      "",
      "",
      "",
      "",
      "",
      "fillingDate",
    ];
  }

  public async parse(caseGroup: [{ [key: string]: string }]): Promise<boolean> {
    for (const group of caseGroup) {
      let items: any[] = [];
      if (this.type == "Felony") {
        items = this.processFelonyItem(group);
      } else if (this.type == "Nollepro") {
        items = this.processNolleproItem(group);
      } else if (this.type == "Daily_Nollepro") {
        items = this.processDailyNolleproItem(group);
      } else if (this.type == "Monthly_Felnoy_Conv") {
        items = this.processMonthlyFelConv(group);
      } else if (this.type == "Monthly_CJIS_Filling") {
        items = this.processMlyCJIS(group);
      }
      for (const item of items) {
        const parsedName = nameParsingService.newParseName(item.partyName);
        const data = {
          "Full Name": parsedName.fullName,
          "First Name": parsedName.firstName,
          "Last Name": parsedName.lastName,
          "Middle Name": parsedName.middleName,
          "Property Address": item.partyAddress1,
          "Property City": item.city,
          "Property State": item.state || "FL",
          "Property Zip": item.zip,
          County: "miami-dade",
          productId: this.productId,
          originalDocType: this.type,
        };

        if (
          await this.saveToOwnerProductPropertyByParser(
            data,
            this.publicProducer
          )
        ) {
          this.count++;
        }
      }
    }

    return true;
  }

  private processFelonyItem(group: { [key: string]: string }): any[] {
    const data = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const items: string[] = [];
      for (let j = 0; j < Object.values(element).length; j++) {
        const temp = Object.values(element)[j];
        if (temp) {
          items.push(temp);
        }
      }
      if (!items[2].includes("UNKNOWN") && !items[2].includes("HOMELESS")) {
        let caseNumber, defendant, partyAddress1, city, state, zip, zipcode;
        caseNumber = items[0];
        defendant = items[1];
        if (items[3].match(/.[A-Z]+[0-9]{5}/g)) {
          const str = items[3].match(/.[A-Z]+[0-9]{5}/g);
          if (str) {
            zip = str[0].match(/[0-9]{5}/g);
            if (zip) {
              state = str[0].replace(zip[0], "");
              zipcode = zip[0];
              city = items[3].replace(str[0], "").trim();
            }
          }
        } else {
          const str = items[3].match(/[A-Z]{2}$/g);
          if (str) {
            state = str[0];
            city = items[3].replace(state, "").trim();
            zipcode = items[4].length === 5 ? items[4] : "";
          }
        }
        if (state) {
          partyAddress1 = items[2].replace(/^[A-Z]{2}[0-9]+/g, "").trim();
          data.push({
            caseNumber,
            partyName: defendant,
            partyAddress1,
            city,
            state,
            zip: zipcode,
          });
        }
      }
    }
    return data;
  }

  private processNolleproItem(group: { [key: string]: string }): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      const items: string[] = [];
      for (let j = 0; j < Object.values(element).length; j++) {
        const temp = Object.values(element)[j];
        if (temp) {
          items.push(temp);
        }
      }
      let partyAddress1, city, caseNumber, partyName, zip, state;
      caseNumber = items[0].replace(/[A-Z]/g, "").trim();
      if (items[3].match(/[0-9]+/g)) {
        partyAddress1 = items[3];
        partyName = items[1] + ", " + items[2];
        if (items[4].match(/[0-9]+/g) || items[4].length == 2) {
          if (items[4].match(/[0-9]+/g) && items[4].match(/[A-Z]+/g)) {
            city = items[4].replace(/[0-9]+/g, "").trim();
          } else {
            city = items[5];
          }
        } else {
          city = items[4];
        }
      } else {
        partyAddress1 = items[4];
        partyName = items[1] + ", " + items[2] + " " + items[3];
        if (items[5].match(/[0-9]+/g) || items[4].length == 2) {
          city = items[6];
        } else {
          city = items[5];
        }
      }
      zip = items[items.length - 1].replace(/[A-Z]{2}/g, "").trim();
      state = items[items.length - 1].replace(/[0-9]+/g, "").trim();
      data.push({ caseNumber, partyAddress1, partyName, city, state, zip });
    }
    return data;
  }

  private processDailyNolleproItem(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      if (value[i].firstName) {
        data.push({
          ...value[i],
          caseNumber: value[i].caseNumber.replace(/[A-Z]/g, ""),
          partyName:
            value[i].lastName +
            ", " +
            value[i].firstName +
            " " +
            value[i].middleName,
        });
      }
    }
    return data;
  }

  private processMonthlyFelConv(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      if (
        value[i].partyAddress1.includes("HOMELESS") ||
        value[i].partyAddress1.includes("UNKNOWN")
      ) {
        continue;
      }
      data.push({
        partyName: value[i].lastName + ", " + value[i].firstName,
        partyAddress1: value[i].partyAddress1,
        city: value[i].city,
        state: value[i].state,
      });
    }
    return data;
  }

  private processMlyCJIS(group: any): any[] {
    const data: any[] = [];
    const value = group[1];
    for (let i = 0; i < value.length; i++) {
      data.push({
        partyName: value[i].lastName + ", " + value[i].firstName,
        partyAddress1: value[i].partyAddress1,
        city: value[i].city,
        state: value[i].state,
        zip: value[i].zip,
        caseNumber: value[i].caseNumber,
        fillingDate: value[i].fillingDate,
      });
    }
    return data;
  }

  public get recordCount() {
    return this.count;
  }
}
