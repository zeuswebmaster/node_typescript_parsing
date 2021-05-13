const fs = require("fs");
const extract = require("extract-zip");
import { verifyToken } from "../services/jwt_service";
import csv from "csvtojson";
import ParserFactory from "../parsers/factory_parser";
import { groupByKey } from "../core/collectionable";
import { SaveData } from "../types/saveData";

const parserFactory = new ParserFactory();

export const parseCsv = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  fileName: string,
  fromFile = true
) => {
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  try {
    if (
      fileName == "SUPROBAT.txt" ||
      fileName == "MOPROBAT.txt" ||
      fileName == "TUPROBAT.txt" ||
      fileName == "WEPROBAT.txt" ||
      fileName == "THPROBAT.txt" ||
      fileName == "FRPROBAT.txt" ||
      fileName == "SAPROBAT.txt"
    ) {
      let data = "";

      if (fromFile) {
        await fs
          .readFileSync(filePathOrCsvString, "utf-8")
          .split(/\r?\n/)
          .forEach(async function (line: any) {
            let fixedLine = line.replace(/\s{2,}/g, "|");
            console.log(fixedLine);
            data += fixedLine + "\n";
          });
        await fs.writeFileSync(filePathOrCsvString, data);
      } else {
        filePathOrCsvString.split(/\r?\n/).forEach(async function (line: any) {
          let fixedLine = line.replace(/\s{2,}/g, "|");
          console.log(fixedLine);
          data += fixedLine + "\n";
        });
        filePathOrCsvString = data;
      }
    }
  } catch (e) {
    console.log("error");
    console.log(e);
    return false;
  }

  const config: any = {
    noheader: true,
    delimiter: parser.getDelimiter(fileName),
  };
  if (!parser.hasHeader()) {
    config.headers = parser.getHeaders(fileName);
  }

  let jsonArray;
  if (fromFile) {
    jsonArray = await csv(config).fromFile(filePathOrCsvString);
  } else {
    jsonArray = await csv(config).fromString(filePathOrCsvString);
  }
  let grouped = groupByKey(jsonArray, "caseNumber");
  const parsedResult = await parser.parse(grouped);

  return true;
};

export const parseMiameDailyZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  console.log("processing ... ... ...");
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  let jsonCasesArray, jsonCaseTypesArray, jsonPartyArray;
  const configCases: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configCases.headers = parser.getHeaders(files[0]);
  jsonCasesArray = await csv(configCases).fromFile(
    filePathOrCsvString + "/" + files[0]
  );

  const configCaseTypes: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configCaseTypes.headers = parser.getHeaders(files[1]);
  jsonCaseTypesArray = await csv(configCaseTypes).fromFile(
    filePathOrCsvString + "/" + files[1]
  );

  let caseArray = [];
  for (let i = 0; i < jsonCasesArray.length; i++) {
    for (let j = 0; j < jsonCaseTypesArray.length; j++) {
      if (jsonCasesArray[i].judgeCode == jsonCaseTypesArray[j].caseTypeCode) {
        caseArray.push({
          ...jsonCasesArray[i],
          description: jsonCaseTypesArray[j].description,
        });
      }
    }
  }

  const configParties: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  configParties.headers = parser.getHeaders(files[2]);
  jsonPartyArray = await csv(configParties).fromFile(
    filePathOrCsvString + "/" + files[2]
  );

  let jsonArray = [];
  for (let i = 0; i < caseArray.length; i++) {
    for (let j = 0; j < jsonPartyArray.length; j++) {
      if (caseArray[i].caseID === jsonPartyArray[j].caseID) {
        const data: SaveData = {
          caseID: caseArray[i].caseID,
          caseNumber: caseArray[i].caseNumber,
          fillingDate: caseArray[i].fillingDate,
          description: caseArray[i].description,
          partyName: jsonPartyArray[j].partyName,
          partyType: jsonPartyArray[j].partyType,
          partyAddress1: jsonPartyArray[j].address1,
          partyAddress2: jsonPartyArray[j].address2,
          dispositionCode: jsonPartyArray[j].dispositionCode,
          dispositionDate: jsonPartyArray[j].dispositionDate,
          city: jsonPartyArray[j].city,
          state: jsonPartyArray[j].state,
          zip: jsonPartyArray[j].zip,
        };
        jsonArray.push(data);
      }
    }
  }

  let grouped = groupByKey(jsonArray, "caseNumber");
  const parsedResult = await parser.parse(grouped);

  return true;
};

export const parseMiameIndebtednessZip = async (
  practiceType: string,
  state: string,
  county: string,
  filePathOrCsvString: string,
  files: any[],
  fromFile = true
) => {
  const parser = await parserFactory.getParser(practiceType, state, county);
  if (!parser) {
    return false;
  }
  console.log("processing ... ... ...");
  const config: any = {
    noheader: true,
    delimiter: parser.getDelimiter(),
  };
  config.headers = parser.getHeaders(files[0]);
  const rows = await csv(config).fromFile(filePathOrCsvString + "/" + files[0]);
  console.log("processing done");
  let jsonArray = [];
  for (let i = 0; i < rows.length; i++) {
    const element = rows[i];
    const data: SaveData = {
      caseNumber: element.caseNumber,
      fillingDate: element.fileDate,
      plaintiff: element.plaintiffName,
      defendant: element.defendantName,
      dispositionCode: element.dispoCode,
      dispositionDate: element.dispoDate,
      description: element.dispoDescription,
      partyAddress1: element.partyStreet,
      city: element.partyCity,
      state: element.partyState,
      zip: element.partyZip,
    };
    jsonArray.push(data);
  }

  for (let i = 0; i < jsonArray.length; i++) {
    const element = jsonArray[i];
    let grouped = groupByKey([element], "caseNumber");
    const parsedResult = await parser.parseIndebtedness(grouped);
  }
  return true;
};

export default async (req: any, res: any) => {
  try {
    const timeout = 30 * 60 * 1000;
    req.setTimeout(timeout);
    res.setTimeout(timeout);

    const token = req.query.token;
    const { valid }: any = await verifyToken(token);
    if (valid) {
      const practiceType = req.body.practiceType;
      const state = req.body.state;
      const county = req.body.county;

      const fileName = req.files.file.name;
      if (/daily_civil_[0-9]+\.zip/g.test(fileName)) {
        try {
          console.log("unzipping file ... ... ...");
          await extract(req.files.file.path, { dir: __dirname });
          fs.readdir(__dirname, async function (err: string, files: any[]) {
            //handling error
            if (err) {
              return res
                .sendStatus(404)
                .send(`No parser found for ${practiceType} ${county}`);
            }
            //listing all files using forEach
            const newFiles: any[] = [];
            files.forEach(function (file: any) {
              if (/CASE\w+\.EXP/g.test(file) || /PARTIES\.EXP/g.test(file)) {
                newFiles.push(file);
              }
            });
            const parse = await parseMiameDailyZip(
              practiceType,
              state,
              county,
              __dirname,
              newFiles
            );
            if (parse) {
              return res.sendStatus(200);
            }
            return res
              .sendStatus(404)
              .send(`No parser found for ${practiceType} ${county}`);
          });
        } catch (err) {
          return res
            .sendStatus(404)
            .send(`No parser found for ${practiceType} ${county}`);
        }
      } else if (/Indebtedness_[0-9]+\.zip/g.test(fileName)) {
        try {
          console.log("unzipping file ... ... ...");
          await extract(req.files.file.path, { dir: __dirname });
          fs.readdir(__dirname, async function (err: string, files: any[]) {
            //handling error
            if (err) {
              return res
                .sendStatus(404)
                .send(`No parser found for ${practiceType} ${county}`);
            }
            //listing all files using forEach
            const newFiles: any[] = [];
            files.forEach(function (file: any) {
              if (/Indebtedness_[0-9]+\.txt/g.test(file)) {
                newFiles.push(file);
              }
            });
            const parse = await parseMiameIndebtednessZip(
              practiceType,
              state,
              county,
              __dirname,
              newFiles
            );
            if (parse) {
              return res.sendStatus(200);
            }
            return res
              .sendStatus(404)
              .send(`No parser found for ${practiceType} ${county}`);
          });
        } catch (err) {
          return res
            .sendStatus(404)
            .send(`No parser found for ${practiceType} ${county}`);
        }
      } else {
        const parse = parseCsv(
          practiceType,
          state,
          county,
          req.files.file.path,
          req.files.file.name
        );
        if (await parse) {
          return res.sendStatus(200);
        }
        return res
          .sendStatus(404)
          .send(`No parser found for ${practiceType} ${county}`);
      }
    }
  } catch (err) {
    console.trace(err);
    res.status(500).send(err);
  }
};
