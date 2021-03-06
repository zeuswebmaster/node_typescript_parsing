import puppeteer from 'puppeteer';
import AbstractPAConsumer from '../../abstract_pa_consumer_updated';
const parser = require('parse-address');
const nameParsingService = require('../../consumer_dependencies/nameParsingServiceNew');

import { IPublicRecordProducer } from '../../../../../../models/public_record_producer';
import { IOwnerProductProperty } from '../../../../../../models/owner_product_property';

export default class PAConsumer extends AbstractPAConsumer {
    publicRecordProducer: IPublicRecordProducer;
    ownerProductProperties: IOwnerProductProperty;

    urls = {
        propertyAppraiserPage: 'https://ward.northdakotaassessors.com/search.php'
    }

    xpaths = {
        isPAloaded: '//input[@id="iHouseNum"]'
    }

    constructor(publicRecordProducer: IPublicRecordProducer, ownerProductProperties: IOwnerProductProperty, browser: puppeteer.Browser, page: puppeteer.Page) {
      super();
      this.publicRecordProducer = publicRecordProducer;
      this.ownerProductProperties = ownerProductProperties;
      this.browser = browser;
      this.browserPages.propertyAppraiserPage = page;
    }

    readDocsToParse(): IOwnerProductProperty {
        return this.ownerProductProperties;
    }

    async init(): Promise<boolean> {
      if (!this.browserPages.propertyAppraiserPage || !this.browser) return false;
      await this.setParamsForPage(this.browserPages.propertyAppraiserPage);
      let retries = 0;
      while (true) {
        try {
          await this.browserPages.propertyAppraiserPage.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load' });
          break;
        } catch (err) {
          console.log(err);
          retries++;
          if (retries > 15) {
              console.log('******** website loading failed');
              return false;
          }
          this.randomSleepIn5Sec();
          console.log(`******** website loading failed, retring... [${retries}]`);
        }
      }
      return true;
    };

    // use this as a middle layer between init() and parseAndSave().
    // this should check if the page is usable or if there was an error,
    // so use an xpath that is available when page is usable.
    // return true when it's usable, false if it errors out.
    async read(): Promise<boolean> {
        try {
            await this.browserPages.propertyAppraiserPage?.waitForXPath(this.xpaths.isPAloaded);
            return true;
        } catch (err) {
            console.warn('Problem loading property appraiser page.');
            return false;
        }
    }

    /**
     * convert address to required infos
     * @param document : IPublicRecordAttributes 
     *  full_address:  1527 N 23rd St, Lincoln, NE 68503
        street_name:   23rd St
        street_full:   1527 N 23rd St
        parsed
            number:     1527
            prefix:     N
            street:     23rd
            type:     St
            city:       Lincoln
            state:      NE
            zip:        68503
     */
    getAddress(document: any): any {
      // 'Property Address': '162 DOUGLAS HILL RD',
      // 'Property City': 'WEST BALDWIN',
      // County: 'Cumberland',
      // 'Property State': 'ME',
      // 'Property Zip': '04091',
      const full_address = `${document['Property Address']}, ${document['Property City']}, ${document['Property State']} ${document['Property Zip']}`
      console.log(full_address);
      const parsed = parser.parseLocation(full_address);
      
      let street_name = parsed.street ? parsed.street.trim() : '';
      let street_full = document['Property Address'];
      let street_with_type = (parsed.number ? parsed.number : '') + ' ' + (parsed.prefix ? parsed.prefix : '') + ' ' + (parsed.street ? parsed.street : '');
      street_with_type = street_with_type.trim();

      return {
        full_address,
        street_name,
        street_with_type,
        street_full,
        parsed
      }
    }

    /**
     * check if element exists
     * @param page 
     * @param selector 
     */
    async checkExistElement(page: puppeteer.Page, selector: string): Promise<Boolean> {
      const exist = await page.$(selector).then(res => res !== null);
      return exist;
    }

    /**
     * get textcontent from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementTextContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        let content = await page.$eval(selector, el => el.textContent)
        return content ? content.trim() : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }
    /**
     * get innerHTML from specified element
     * @param page 
     * @param root 
     * @param selector 
     */
    async getElementHtmlContent(page: puppeteer.Page, selector: string): Promise<string> {
      try {
        const existSel = await this.checkExistElement(page, selector);
        if (!existSel) return '';
        const content = await page.$eval(selector, el => el.innerHTML)
        return content ? content : '';
      } catch (error) {
        console.log(error)
        return '';
      }
    }

    /**
     * Parse owner names
     * @param name_str : string
     * @param address : string
     */
    parseOwnerName(name_str: string): any[] {
      const result: any = {};

      let parserName = nameParsingService.newParseName(name_str);

      result['full_name'] = parserName.fullName;
      result['first_name'] = parserName.firstName;
      result['last_name'] = parserName.lastName;
      result['middle_name'] = parserName.middleName;
      result['suffix'] = parserName.suffix;
      return result;
    }

    getSuffix(name: string) : any {
      const suffixList = ['esq','esquire','jr','jnr','sr','snr','2','ii','iii','iv','md','phd','j.d.','ll.m.','m.d.','d.o.','d.c.','p.c.','ph.d.'];
      name = name.toLowerCase();
      for(let suffix of suffixList){
          let regex = new RegExp(' '+suffix, 'gm');
          if (name.match(regex)){
              return suffix;
          }
      }
      return '';
    }
    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    /**
     * Compare 2 addresses
     * @param address1 
     * @param address2 
     */
    compareAddress(address1: any, address2: any): Boolean {
      if(!address1 || !address2){
        return false;
      }
      const address1_number = address1.number===undefined ? '' : address1.number.trim().toUpperCase();
      const address2_number = address2 ? (address2.number===undefined ? '' : address2.number.trim().toUpperCase()) : '';
      const address1_prefix = address1 && address1.prefix===undefined ? '' : address1.prefix.trim().toUpperCase();
      const address2_prefix = address2 ? (address2.prefix===undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
      const address1_type = address1.type===undefined ? '' : address1.type.trim().toUpperCase();
      const address2_type = address2 ? (address2.type===undefined ? '' : address2.type.trim().toUpperCase()) : '';
      const address1_street = address1.street===undefined ? '' : address1.street.trim().toUpperCase();
      const address2_street = address2 ? (address2.street===undefined ? '' : address2.street.trim().toUpperCase()) : '';

      return  (address1_number === address2_number) &&
              (address1_prefix === address2_prefix) &&
              (address1_type === address2_type) &&
              (address1_street === address2_street) && 
              (address1.sec_unit_num === address2.sec_unit_num);
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean> {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
                return false;
              }
            
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
            let search_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
              const nameInfo = this.getNameInfo(document.ownerId, ',');
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
            } else {
              parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
              search_addr = document.propertyId['Property Address'];
              const parsev2 = this.getAddressV2(document.propertyId);
              if(!this.isEmptyOrSpaces(parsev2.street_address)){
                  parsed_addr = parser.parseLocation(parsev2.street_address);
                  search_addr = parsev2.street_address;
              }
              if(!parsed_addr || !parsed_addr.number || !parsed_addr.street){
                  console.log("Street number or street name is missing!");
                  return false;
              }
              console.log(`Looking for property: ${search_addr}`);
            }

            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'networkidle0'});
              } catch (error) {
                await page.reload();
              }
              try {
                let tosButton = await page.$x('//input[@name="agree"]');
                if(tosButton.length > 0){
                    await tosButton[0].click();
                }
                await page.waitForSelector('input#iaddr');
                if(this.searchBy == 'address'){
                  if(parsed_addr.number){
                      await page.type('input#iHouseNum', parsed_addr.number, {delay: 50})
                  }
                  if(parsed_addr.street){
                      await page.type('input#iaddr', parsed_addr.street, {delay: 50})
                  }
                } else {
                  await page.type('input#iDeedHolder', owner_name, {delay: 50})
                }
                await Promise.all([
                    page.click('input[value="Display Results"]'),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                let [foundOne] = await page.$x('//div[@id="pclGeneralInfo"]');
                if(foundOne){
                  const result = await this.getPropertyInfos(page);
                  await this.parseResult(result, document);
                  break;
                }

                let search_results = await page.$x('//table[@id="resultsWrapper"]/tbody/tr');
                if(search_results.length < 2){
                  console.log('Not found!');
                  break;
                }
                const datalinks: any = [];
                search_results.shift();
                for(const row of search_results){
                  let link = await row.evaluate(el => el.children[0].children[0].getAttribute('href'));
                  link = "https://ward.northdakotaassessors.com/" + link?.trim();
                  let name = await row.evaluate(el => el.children[2].textContent?.trim());
                  let address: any = await row.evaluate(el => el.children[3].textContent?.trim());
                  address = address?.split('\n')[0];
                  if(this.searchBy == 'name'){
                    const regexp = new RegExp(owner_name_regexp);
                    if (regexp.exec(name!.toUpperCase())){
                        datalinks.push(link);
                    }
                  } else {
                    if(this.compareStreetAddress(address, search_addr)){
                      datalinks.push(link);
                      break;
                    }
                  }
                }
                if (datalinks.length === 0) {
                    console.log("The search results is not reliable! (different from the keyword)");
                    break;
                }
                console.log(datalinks);
                for (let datalink of datalinks) {
                    try{
                        console.log("Processing => ", datalink);
                        await page.goto(datalink, {waitUntil: 'networkidle0'});
                        let result = await this.getPropertyInfos(page);
                        await this.parseResult(result, document);
                    } catch (e){
                        console.log(e);
                        console.log('Error during parse property (possibly property is N/A)');
                        continue;
                    }
                }
                break;
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(1000);
              }    
            }                       
        return true;
    }

    async parseResult(result: any, document: any) {
        let dataFromPropertyAppraisers = {
            'Full Name': result['owner_names'][0]['full_name'],
            'First Name': result['owner_names'][0]['first_name'],
            'Last Name': result['owner_names'][0]['last_name'],
            'Middle Name': result['owner_names'][0]['middle_name'],
            'Name Suffix': result['owner_names'][0]['suffix'],
            'Mailing Care of Name': '',
            'Mailing Address': result['mailing_address'],
            'Mailing Unit #': '',
            'Mailing City': result['mailing_city'],
            'Mailing State': result['mailing_state'],
            'Mailing Zip': result['mailing_zip'],
            'Property Address': result['property_address'],
            'Property Unit #': '',
            'Property City': result['property_city'] || '',
            'Property State': this.publicRecordProducer.state.toUpperCase(),
            'Property Zip': result['property_zip'] || '',
            'County': this.publicRecordProducer.county,
            'Owner Occupied': result['owner_occupied'],
            'Property Type': result['property_type'],
            'Total Assessed Value': result['total_assessed_value'],
            'Last Sale Recording Date': result['last_sale_recording_date'],
            'Last Sale Amount': result['last_sale_amount'],
            'Est. Remaining balance of Open Loans': '',
            'Est Value': result['est_value'],
            'yearBuilt': '',
            'Est Equity': '',
            'Lien Amount': ''
        };
        try{
            // console.log(dataFromPropertyAppraisers);
            await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
        } catch(e){
            //
        }
    }

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
        const [elm] = await page.$x(xPath);
        if (elm == null) {
            return '';
        }
        let text = await page.evaluate(j => j.textContent, elm);
        return text.trim();
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
        // name
        const full_name_xpath = '//td[contains(., "Deed Holder:")]/parent::tr/td[2]';
        let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
        const owner_names = [];
        full_name = full_name.split("&")[0].trim();
        let parseName = this.parseOwnerName(full_name);
        owner_names.push(parseName);

        // property address
        const property_address_xpath = '//td[contains(., "Property Address:")]/parent::tr/td[2]/text()[1]';
        const property_address_2_xpath = '//td[contains(., "Property Address:")]/parent::tr/td[2]/text()[last()-1]';
        let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
        let property_address_2 = await this.getTextByXpathFromPage(page, property_address_2_xpath);
        let property_address_2_arr = property_address_2.split(/\s+/g);
        let property_zip = property_address_2_arr.pop();
        let property_state = property_address_2_arr.pop();
        let property_city = '';
        for (const word of property_address_2_arr){
          property_city += word + " ";
        }
        property_city = property_city.replace(",","").trim();

        // mailing address
        const mailing_address_xpath = '//td[contains(., "Mailing Address:")]/parent::tr/td[2]/text()[2]';
        const mailing_address_2_xpath = '//td[contains(., "Mailing Address:")]/parent::tr/td[2]/text()[last()]';
        let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
        let mailing_address_2 = await this.getTextByXpathFromPage(page, mailing_address_2_xpath);
        let mailing_address_2_arr = mailing_address_2.split(/\s+/g);
        mailing_address_2_arr.pop();
        let mailing_zip = mailing_address_2_arr.pop();
        let mailing_state = mailing_address_2_arr.pop();
        let mailing_city = '';
        for (const word of mailing_address_2_arr){
          mailing_city += word + " ";
        }
        mailing_city = mailing_city.replace(",","").trim();

        const property_address_parsed = parser.parseLocation(property_address);
        const mailing_address_parsed = parser.parseLocation(mailing_address);
        // owner occupied
        let owner_occupied;
        try{
          owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
        } catch(e){
          owner_occupied = false;
        }
  
        // sales info"
        const last_sale_recording_date_xpath = '//div[@id="sale0"]//div[@class="saleColumn"]';
        const last_sale_amount_xpath = '//div[@id="sale0"]//div[@class="saleColumn2"]';
        const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
        const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);
  
        // property type
        const property_type_xpath = '//td[contains(., "Class:")]/parent::tr/td[2]';
        const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);
  
        // assessed value and est. value
        const total_assessed_value_xpath = '//div[@class="pyValues"]/div[last()]';
        const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
        const est_value = '';
  
        return {
          owner_names,
          property_address,
          property_city,
          property_zip,
          property_state,
          mailing_address,
          mailing_city,
          mailing_zip,
          mailing_state,
          owner_occupied,
          property_type, 
          total_assessed_value, 
          last_sale_recording_date, 
          last_sale_amount, 
          est_value
        }
      }
}