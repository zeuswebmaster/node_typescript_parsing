// cron(0/1 20-13 * * ? *)
require('dotenv').config();
import db from '../models/db';
import { IPublicRecordProducer } from '../models/public_record_producer';
import AbstractProducer from '../categories/public_records/producers/abstract_producer';

setTimeout(() => {
    console.log('Stopped because exceeded the time limit! (30 minutes)');
    process.exit();
}, 1800000); // 30 minutes

const state: string = process.argv[2];
const county: string = process.argv[3];

async function fetchProduct(productName: string): Promise<any> {
    const {default: Product} = await import(productName);
    return Product;
}

( async () => {    
    
    let condition: any = { source: 'civil' };
    if (state && county) {
      condition = {
        ...condition,
        state: state.toUpperCase(),
        county: county
      };
    } else {
      condition = {
        ...condition,
        processed: false
      }
    }

    const data = await db.models.PublicRecordProducer.aggregate([
        { $match: condition },
        { $lookup: { from: 'county_priorities', localField: 'countyPriorityId', foreignField: '_id', as: 'county_priorities' }},
        { $unwind: "$county_priorities" },
        { $sort: {'county_priorities.priority': 1}}
    ]).limit(1);
    
    console.log(data);
    if(data.length > 0) {
        // use findOneAndUpdate for atomic operation since multiple tasks run in parallel and we don't want to tasks pulling the same public record producer
        const publicRecordProducer: IPublicRecordProducer = await db.models.PublicRecordProducer.findOneAndUpdate({ _id: data[0]['_id'] }, { processed: true });
        const state = publicRecordProducer.state.toLowerCase();
        let civilProducer: any;

        try {
            civilProducer = await fetchProduct(`../categories/public_records/producers/civil/${state}/${publicRecordProducer.county}/civil_producer`);
        } catch(e) {
            console.log(`cannot find civil producer ${state} ${publicRecordProducer.county}`);
        }

        if(civilProducer) {
            console.log(`now processing county ${publicRecordProducer.county} in state ${state} at ${new Date()}`);
            await new civilProducer(publicRecordProducer).startParsing();
        }
        
        let codeViolationProducer: any;
        try {
            codeViolationProducer = await fetchProduct(`../categories/public_records/producers/code_violation/${state}/${publicRecordProducer.county}/civil_producer`);
        } catch(e) {
            console.log(`cannot find code-violation producer state: ${state} county: ${county}`);
        }
        if(codeViolationProducer) {
            console.log(`now processing county ${publicRecordProducer.county} in state ${state} at ${new Date()}`);
            await new codeViolationProducer(publicRecordProducer).startParsing();
        }
    } else {
        console.log('==============================');
        console.log('no remaining civil producers');
    }
    console.log('>>>>> end <<<<<')
    process.exit();
})();