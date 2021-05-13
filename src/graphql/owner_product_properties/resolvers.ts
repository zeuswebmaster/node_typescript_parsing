import db from "../../models/db"
import {verifyToken} from '../../services/jwt_service';
import { IOwnerProductProperty } from '../../models/owner_product_property';
import AddressService from '../../services/address_service';
import { normalizeDate }  from '../../services/general_service';
import mongoose from 'mongoose';
import moment from 'moment';

export default {
    Query: {
        async fetchOwnerProductProperties(parent: any, args: any): Promise<any> {
            const token = args['token'];
            const validate: any = await verifyToken(token);

            if (validate['valid']) {
                const filters = args['filters'] ? JSON.parse(args['filters']) : []
                let filterProperty:any = {};
                for (let i = 0; i < filters.length; i++) {
                    const key = filters[i][0].indexOf('Name') > -1 || filters[i][0].indexOf('Mailing') > -1 ? 'owner' : 'property';
                    filterProperty[`${key}.${filters[i][0]}`] = {$regex:new RegExp(filters[i][1], 'i')};
                }
                console.log('filterProperty = ', filterProperty);
                const practiceType = args['practiceType'] ? args['practiceType'] : 'all';
                const perPage = args['perPage'] ? args['perPage'] : 20;
                const currentPage = args['currentPage'] ? args['currentPage'] : 0;
                const from = args['from'];
                const to = args['to'];
                const skipRecords = perPage * (currentPage);
                const selState = args['state'];
                const selCounty = args['county'];
                const zip = args['zip'];
                console.log('the from date: ', from);
                console.log('the to date: ', to);
                console.log('practiceType: ', practiceType);
                console.log('state: ', selState);
                console.log('county: ', selCounty);
                console.log('zip: ', zip);

                let dateFrom = new Date(new Date(from).setHours(0, 0, 0));
                let dateTo = new Date(new Date(to).setHours(23, 59, 59))
                let condition: any = {
                    createdAt: {
                        $gte: dateFrom,
                        $lt: dateTo
                    },
                    processed: true,
                    consumed: true,
                    ownerId: {$ne: null},
                    propertyId: {$ne: null}
                };

                if (practiceType !== 'all' || selState !== 'all' || selCounty !== 'all') {
                    let regexpProduct = `/${selState==='all'?'.*':selState}/${selCounty==='all'?'.*':selCounty}/${practiceType==='all'?'.*':practiceType}$`;
                    const productIds = await db.models.Product.find({name: {$regex: new RegExp(regexpProduct, 'i')}}).exec();
                    condition = {...condition, productId: {$in: productIds.map(prod => mongoose.Types.ObjectId(prod.id))}};
                }

                console.log('ensure performance index exists on condition: ', condition);
                const aggregateConditions: any[] = [
                    {$lookup: {from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'property'}},
                    {$unwind: "$property"},
                    {$lookup: {from: 'owners', localField: 'ownerId', foreignField: '_id', as: 'owner'}},
                    {$unwind: "$owner"},
                    {$lookup: {from: 'products', localField: 'productId', foreignField: '_id', as: 'product'}},
                    {$unwind: "$product"},
                  ];
                  if (zip) {
                    aggregateConditions.push(
                      {
                        $match: {
                          'property.Property Zip': {
                            $in: [
                              zip
                            ],
                          }
                        }
                      }
                    )
                  }

                const docs: any[] = await db.models.OwnerProductProperty.aggregate([
                    { $match: condition },
                    {$skip: skipRecords },
                    ...aggregateConditions
                    ])
                    .limit(perPage);

                const countField = 'createdAt'
                let match: any[] = []
                if (zip) {
                  match = [
                    {$lookup: {from: 'properties', localField: 'propertyId', foreignField: '_id', as: 'property'}},
                    {
                        $match: {
                            'property.Property Zip': {
                             $in: [
                                    zip
                                ],
                            }
                        }
                    },
                  ]
                }
                const countResult: any[] = await db.models.OwnerProductProperty.aggregate([
                  {$match: condition },
                  ...match,
                  { $count : countField }
                ]);
                const count = (countResult[0] && countResult[0][countField]) || 0
                console.log('COUNT = ', count);
                const practiceTypes: any = {
                    'foreclosure': 'Foreclosure',
                    'preforeclosure': 'Preforeclosure',
                    'bankruptcy': 'Bankruptcy',
                    'tax-lien': 'Tax Lien',
                    'auction': 'Auction',
                    'inheritance': 'Inheritance',
                    'probate': 'Probate',
                    'eviction': 'Eviction',
                    'hoa-lien': 'Hoa Lien',
                    'irs-lien': 'Irs Lien',
                    'mortgage-lien': 'Mortgage Lien',
                    'pre-inheritance': 'Pre Inheritance',
                    'pre-probate': 'Pre Probate',
                    'divorce': 'Divorce',
                    'tax-delinquency': 'Tax Delinquency',
                    'code-violation': 'Code Violation',
                    'absentee-property-owner': 'Absentee Property Owner',
                    'vacancy': 'Vacancy',
                    'debt': 'Debt',
                    'personal-injury': 'Personal Injury',
                    'marriage': 'Marriage',
                    'child-support': 'Child Support',
                    'other-civil': 'Other Civil',
                };
                console.log('size should be no more than maximum pagination size: ', docs.length);

                const records: any[] = [];
                for(const doc of docs) {
                    const record: any = {};
                    let last_sale_recording_date: any = normalizeDate(doc['property']?.['Last Sale Recording Date']);
                    // check property address
                    let property_address = doc['property']?.['Property Address'];
                    let property_city = doc['property']?.['Property City'];
                    let property_state = doc['property']?.['Property State'];
                    let property_zip = doc['property']?.['Property Zip'];
                    if (AddressService.detectFullAddress(property_address)) {
                        const parsed_address = AddressService.getParsedAddress(property_address);
                        if (parsed_address) {
                            property_address = parsed_address.street_address;
                            if (!property_city) property_city = parsed_address.city;
                            if (!property_state) property_state = parsed_address.state;
                            if (!property_zip) property_zip = parsed_address.zip;
                        }
                    }

                    // check mailing address
                    let mailing_address = doc['owner']?.['Mailing Address'];
                    let mailing_city = doc['owner']?.['Mailing City'];
                    let mailing_state = doc['owner']?.['Mailing State'];
                    let mailing_zip = doc['owner']?.['Mailing Zip'];
                    if (AddressService.detectFullAddress(mailing_address)) {
                        const parsed_address = AddressService.getParsedAddress(mailing_address);
                        if (parsed_address) {
                            mailing_address = parsed_address.street_address;
                            if (!mailing_city) mailing_city = parsed_address.city;
                            if (!mailing_state) mailing_state = parsed_address.state;
                            if (!mailing_zip) mailing_zip = parsed_address.zip;
                        }
                    }
                    record['Created At'] = moment(doc['createdAt']).format('MM-DD-YYYY').toString();
                    record['Updated At'] = moment(doc['updatedAt']).format('MM-DD-YYYY').toString();
                    const practiceType = doc['product']?.['name']?.split('/')[3]?.trim()
                    record['Practice Type'] = practiceTypes[practiceType];
                    record['Full Name'] = doc['owner']?.['Full Name'];
                    record['First Name'] = doc['owner']?.['First Name'];
                    record['Last Name'] = doc['owner']?.['Last Name'];
                    record['Middle Name'] = doc['owner']?.['Middle Name'];
                    record['Name Suffix'] = doc['owner']?.['Name Suffix'];
                    record['Phone'] = doc['owner']?.['Phone'];
                    record['Mailing Address'] = mailing_address;
                    record['Mailing Unit #'] = doc['owner']?.['Mailing Unit #'];
                    record['Mailing City'] = mailing_city;
                    record['Mailing State'] = mailing_state;
                    record['Mailing Zip'] = mailing_zip;
                    record['Property Address'] = property_address;
                    record['Property Unit #'] = doc['property']?.['Property Unit #'];
                    record['Property City'] = property_city;
                    record['Property Zip'] = property_zip;
                    record['Property State'] = property_state;
                    record['County'] = doc['property']?.['County'];
                    record['Owner Occupied'] = doc['property']?.['Owner Occupied'];
                    record['Property Type'] = doc['property']?.['Property Type'];
                    record['Total Assessed Value'] = doc['property']?.['Total Assessed Value'];
                    record['Last Sale Recording Date'] = last_sale_recording_date;
                    record['Last Sale Recording Date Formatted'] = doc['property']?.['Last Sale Recording Date Formatted'];
                    record['Last Sale Amount'] = doc['property']?.['Last Sale Amount'];
                    record['Est Value'] = doc['property']?.['Est Value'];
                    record['Est Equity'] = doc['property']?.['Est Equity'];
                    record['Effective Year Built'] = doc['property']?.['Effective Year Built'];
                    record['yearBuilt'] = doc['property']?.['yearBuilt'];
                    record['vacancy'] = doc['property']?.['vacancy'];
                    record['vacancyDate'] = doc['property']?.['vacancyDate'];
                    record['parcel'] = doc['property']?.['parcel'];
                    record['descbldg'] = doc['property']?.['descbldg'];
                    record['listedPrice'] = doc['property']?.['listedPrice'];
                    record['listedPriceType'] = doc['property']?.['listedPriceType'];
                    record['listedPrice1'] = doc['property']?.['listedPrice1'],
                    record['listedPriceType1'] = doc['property']?.['listedPriceType1'],
                    record['sold'] = doc['property']?.['sold'],
                    record['Sold Date'] = doc['property']?.['Sold Date'],
                    record['soldAmount'] = doc['property']?.['soldAmount'],
                    record['improvval'] = doc['property']?.['improvval'];
                    record['ll_bldg_footprint_sqft'] = doc['property']?.['ll_bldg_footprint_sqft'];
                    record['ll_bldg_count'] = doc['property']['ll_bldg_count'];
                    record['legaldesc'] = doc['property']['legaldesc'];
                    record['sqft'] = doc['property']['sqft'];
                    record['sqftlot'] = doc['property']['sqftlot'];
                    record['bedrooms'] = doc['property']['bedrooms'];
                    record['bathrooms'] = doc['property']['bathrooms'];
                    record['ll_gisacre'] = doc['property']['ll_gisacre'];
                    record['lbcs_activity_desc'] = doc['property']['lbcs_activity_desc'];
                    record['lbcs_function_desc'] = doc['property']['lbcs_function_desc'];
                    record['livingarea'] = doc['property']['livingarea'];
                    record['assessmentyear'] = doc['property']['assessmentyear'];
                    record['assedvalschool'] = doc['property']['assedvalschool'];
                    record['assedvalnonschool'] = doc['property']['assedvalnonschool'];
                    record['taxvalschool'] = doc['property']['taxvalschool'];
                    record['taxvalnonschool'] = doc['property']['taxvalnonschool'];
                    record['justvalhomestead'] = doc['property']['justvalhomestead'];
                    record['effyearbuilt'] = doc['property']['effyearbuilt'];
                    record['Toal Open Loans'] = doc['property']['Toal Open Loans'];
                    record['Lien Amount'] = doc['property']['Lien Amount'];
                    record['Est. Remaining balance of Open Loans'] = doc['property']['Est. Remaining balance of Open Loans'];
                    record['Tax Lien Year'] = doc['property']['Tax Lien Year'];

                    records.push(record);
                }
                // console.log(records);
                console.log(records.length);
                return {
                    success: true,
                    data: JSON.stringify(records),
                    count
                };
            } else {
                return {
                    success: false,
                    error: validate.err
                };
            }
        }
    },
    Mutation: {}
}
