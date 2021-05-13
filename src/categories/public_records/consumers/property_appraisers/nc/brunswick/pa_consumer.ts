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
        propertyAppraiserPage: 'https://tax.brunsco.net/itsnet/RealEstate.aspx'
    }

    xpaths = {
        isPAloaded: '//input[@id="ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxOwnerLastName"]'
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

    async getTextByXpathFromPage(page: puppeteer.Page, xPath: string): Promise<string> {
      const [elm] = await page.$x(xPath);
      if (elm == null) {
          return '';
      }
      let text = await page.evaluate(j => j.textContent, elm);
      return text.trim();
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

    /**
     * Remove spaces, new lines
     * @param text : string
     */
    simplifyString(text: string): string {
      return text.replace(/( +)|(\n)/gs, ' ').trim();
    }

    compareAddress(address1: any, address2: any): Boolean {
        const address1_number = address1.number === undefined ? '' : address1.number.trim().toUpperCase();
        const address2_number = address2 ? (address2.number === undefined ? '' : address2.number.trim().toUpperCase()) : '';
        const address1_prefix = address1 && address1.prefix === undefined ? '' : address1.prefix.trim().toUpperCase();
        const address2_prefix = address2 ? (address2.prefix === undefined ? '' : address2.prefix.trim().toUpperCase()) : '';
        const address1_type = address1.type === undefined ? '' : address1.type.trim().toUpperCase();
        const address2_type = address2 ? (address2.type === undefined ? '' : address2.type.trim().toUpperCase()) : '';
        const address1_street = address1.street === undefined ? '' : address1.street.trim().toUpperCase();
        const address2_street = address2 ? (address2.street === undefined ? '' : address2.street.trim().toUpperCase()) : '';

        return (address1_number === address2_number) &&
            (address1_prefix === address2_prefix) &&
            (address1_type === address2_type) &&
            (address1_street === address2_street);
    }

    // the main parsing function. if read() succeeds, parseAndSave is started().
    // return true after all parsing is complete 

    // docsToParse is the collection of all address objects to parse from mongo.
    // !!! Only mutate document objects with the properties that need to be added!
    // if you need to multiply a document object (in case of multiple owners
    // or multiple properties (2-3, not 30) you can't filter down to one, use this.cloneMongoDocument(document);
    // once all properties from PA have been added to the document, call 
    async parseAndSave(docsToParse: IOwnerProductProperty): Promise<boolean>   {
        const page = this.browserPages.propertyAppraiserPage;
        if (page === undefined) return false;
        let document = docsToParse;
            if (!this.decideSearchByV2(document)) {
              return false;
            }
            
            // do everything that needs to be done for each document here
            // parse address
            let parsed_addr;
            let first_name = '';
            let last_name = '';
            let owner_name = '';
            let owner_name_regexp = '';

            if (this.searchBy === 'name') {
              const nameInfo = this.getNameInfo(document.ownerId);
              first_name = nameInfo.first_name;
              last_name = nameInfo.last_name;
              owner_name = nameInfo.owner_name;
              owner_name_regexp = nameInfo.owner_name_regexp;
              if (owner_name === '') return false;
              console.log(`Looking for owner: ${owner_name}`);
            }
            else {
                parsed_addr = parser.parseLocation(document.propertyId['Property Address']);
                const parseaddr = this.getAddressV2(document.propertyId);
                if(!this.isEmptyOrSpaces(parseaddr.street_address)){
                    parsed_addr = parser.parseLocation(parseaddr.street_address);
                }
                if(!parsed_addr || (!parsed_addr.number && !parsed_addr.street)){
                    console.log("Street name and number is missing!");
                    return false;
                }
                console.log(`Looking for address: ${document.propertyId['Property Address']}`);
            }
            let retry_count = 0;
            while (true){
              if (retry_count > 15){
                  console.error('Connection/website error for 15 iteration.');
                  return false;
              }
              try {
                await page.goto(this.urls.propertyAppraiserPage, { waitUntil: 'load'});
              } catch (error) {
                await page.reload();
              }
              try {
                await page.waitForSelector('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxOwnerLastName');
                if (this.searchBy == 'name'){
                    await page.type('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxOwnerLastName', last_name, {delay: 150});
                    await page.type('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxOwnerFirstName', first_name, {delay: 150});
                } else {
                    if(parsed_addr.number){
                        await page.type('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxHouse', parsed_addr.number, {delay: 150});
                    }
                    if(parsed_addr.street){
                        await page.type('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxStreetName', parsed_addr.street, {delay: 150});
                    }
                    if(parsed_addr.sec_unit_num){
                        await page.type('input#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_textboxUnit', parsed_addr.sec_unit_num, {delay: 150});
                    }
                    if(parsed_addr.prefix){
                        try{
                            await page.select('#ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_dropdownlistDir', parsed_addr.prefix);
                        } catch(e){
                            //
                        }
                    }
                }
                let buttonSearch = await page.$x('//input[@id="ctl00_contentplaceholderRealEstateSearch_usercontrolRealEstateSearch_buttonSearch"]');
                await Promise.all([
                    buttonSearch[0].click(),
                    page.waitForNavigation({waitUntil: 'networkidle0'})
                ]);
                
                let search_results = await page.$x('//table[@id="ctl00_contentplaceholderRealEstateSearchResults_usercontrolRealEstateSearchResult_gridviewSearchResults"]/tbody/tr');
                if(search_results.length < 2){
                    console.log("Not found!");
                    break;
                }
                const datalinks: any = [];
                search_results.shift();
                if(this.searchBy == 'name'){
                    for(let i = 0; i < search_results.length; i++){
                        search_results = await page.$x('//table[@id="ctl00_contentplaceholderRealEstateSearchResults_usercontrolRealEstateSearchResult_gridviewSearchResults"]/tbody/tr');
                        search_results.shift();
                        try{
                            let id = await search_results[i].evaluate(el => el.children[0].children[0].textContent?.trim());
                            let name = await search_results[i].evaluate(el => el.children[4].textContent?.trim());
                            const regexp = new RegExp(owner_name_regexp);
                            if (!regexp.exec(name!.toUpperCase())){
                                continue;
                            }
                            let link = await page.$x('//a[contains(text(), "'+id+'")]');
                            await Promise.all([
                                link[0].click(),
                                page.waitForNavigation({waitUntil: 'networkidle0'})
                            ]);
                            let result = await this.getPropertyInfos(page);
                            await this.parseResult(result, document);
                            await page.goBack();
                            await page.waitForXPath('//table[@id="ctl00_contentplaceholderRealEstateSearchResults_usercontrolRealEstateSearchResult_gridviewSearchResults"]/tbody/tr');
                        } catch(e){
                            console.log(e);
                            continue;
                        }
                    }
                } else {
                    let id = await search_results[0].evaluate(el => el.children[0].children[0].textContent?.trim());
                    let link = await page.$x('//a[contains(text(), "'+id+'")]');
                    await Promise.all([
                        link[0].click(),
                        page.waitForNavigation({waitUntil: 'networkidle0'})
                    ]);
                    let result = await this.getPropertyInfos(page);
                    await this.parseResult(result, document);
                }
                break;                    
              } catch (error) {
                console.log(error);
                console.log('retrying... ', retry_count);
                retry_count++;
                await page.waitFor(1000);
              }    
            }
            await this.randomSleepIn5Sec();
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
          'Mailing Address': result['mailing_address'] || '',
          'Mailing Unit #': '',
          'Mailing City': result['mailing_city'] || '',
          'Mailing State': result['mailing_state'] || '',
          'Mailing Zip': result['mailing_zip'] || '',
          'Property Address': result['property_address'],
          'Property Unit #': '',
          'Property City': result['property_city'] || '',
          'Property State': this.publicRecordProducer.state.toUpperCase(),
          'Property Zip': result['property_zip'] || '',
          'County': this.publicRecordProducer.county,
          'Owner Occupied': result['owner_occupied'],
          'Property Type': result['property_type'] || '',
          'Total Assessed Value': result['total_assessed_value'],
          'Last Sale Recording Date': result['last_sale_recording_date'],
          'Last Sale Amount': result['last_sale_amount'],
          'Est. Remaining balance of Open Loans': '',
          'Est Value': result['est_value'],
          'yearBuilt': result['year_built'],
          'Est Equity': '',
          'Lien Amount': ''
      };
      try{
        await this.saveToOwnerProductPropertyV2(document, dataFromPropertyAppraisers);
      } catch(e){
        //
      }
    }

    async getPropertyInfos(page: puppeteer.Page): Promise<any> {
      // name
      const full_name_xpath = '//span[@id="ctl00_contentplaceholderRealEstateSearchSummary_usercontrolRealEstateParcelSummaryInfo_labelOwnerName"]';
      let full_name = await this.getTextByXpathFromPage(page, full_name_xpath);
      const owner_names = [];
      full_name = full_name.split("&")[0].trim();
      let parseName = this.parseOwnerName(full_name);
      owner_names.push(parseName);

      // property address
      await page.click('#__tab_ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelBuilding');
      const property_address_xpath = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelBuilding_usercontrolRealEstateParcelBuildingData_gridviewParcelBuilding"]/tbody/tr[2]/td[9]';
      let property_address = await this.getTextByXpathFromPage(page, property_address_xpath);
      property_address = property_address.replace(/\s+/g, ' ');
      let property_address_parsed = parser.parseLocation(property_address);
      const year_built = await this.getTextByXpathFromPage(page, '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelBuilding_usercontrolRealEstateParcelBuildingData_gridviewParcelBuilding"]/tbody/tr[2]/td[2]');

      // property type
      const property_type_xpath = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelBuilding_usercontrolRealEstateParcelBuildingData_gridviewParcelBldgUseModel"]/tbody/tr[2]/td[1]';
      const property_type = await this.getTextByXpathFromPage(page, property_type_xpath);

      await page.click('#__tab_ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelOwners');
      // mailing address
      const mailing_address_xpath = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelOwners_usercontrolRealEstateParcelOwnersData_gridviewParcelOwnersData"]/tbody/tr[2]/td[3]';
      const mailing_city_path = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelOwners_usercontrolRealEstateParcelOwnersData_gridviewParcelOwnersData"]/tbody/tr[2]/td[4]';
      const mailing_state_path = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelOwners_usercontrolRealEstateParcelOwnersData_gridviewParcelOwnersData"]/tbody/tr[2]/td[5]';
      const mailing_zip_path = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelOwners_usercontrolRealEstateParcelOwnersData_gridviewParcelOwnersData"]/tbody/tr[2]/td[6]';
      let mailing_address = await this.getTextByXpathFromPage(page, mailing_address_xpath);
      let mailing_zip = await this.getTextByXpathFromPage(page, mailing_zip_path);
      let mailing_state = await this.getTextByXpathFromPage(page, mailing_state_path);
      let mailing_city = await this.getTextByXpathFromPage(page, mailing_city_path);
      const mailing_address_parsed = parser.parseLocation(mailing_address);

      // owner occupied
      let owner_occupied;
      try{
        owner_occupied = this.compareAddress(property_address_parsed, mailing_address_parsed);
      } catch(e){
        owner_occupied = false;
      }

      await page.click('#__tab_ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelSales');
      // sales info"
      const last_sale_recording_date_xpath = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelSales_usercontrolRealEstateParcelSalesData_gridviewParcelSalesData"]/tbody/tr[last()]/td[3]';
      const last_sale_amount_xpath = '//table[@id="ctl00_contentplaceholderRealEstateWorkplace_tabcontainerWorkSpace_tabpanelSales_usercontrolRealEstateParcelSalesData_gridviewParcelSalesData"]/tbody/tr[last()]/td[6]';
      const last_sale_recording_date = await this.getTextByXpathFromPage(page, last_sale_recording_date_xpath);
      const last_sale_amount = await this.getTextByXpathFromPage(page, last_sale_amount_xpath);

      // assessed value and est. value
      const total_assessed_value_xpath = '//span[@id="ctl00_contentplaceholderRealEstateSearchSummary_usercontrolRealEstateParcelSummaryInfo_labelTaxableValue"]';
      const total_assessed_value = await this.getTextByXpathFromPage(page, total_assessed_value_xpath);
      const est_value = '';

      return {
        owner_names, 
        property_address,
        property_address_parsed,
        mailing_address,
        mailing_city,
        mailing_zip,
        mailing_state,
        owner_occupied,
        property_type, 
        total_assessed_value, 
        last_sale_recording_date, 
        last_sale_amount, 
        est_value,
        year_built
      }
    }
}