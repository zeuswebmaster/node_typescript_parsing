require('dotenv').config();
import db from '../models/db';

const state: string = process.argv[2] || 'california';
const county: string = process.argv[3] || 'stanislaus';

console.log('selected state: ', state);
console.log('selected county: ', county);

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'property-appraiser-consumer' 
        }, 
        {  
            $set: { processed: true }
        }
    );

    await db.models.PublicRecordProducer.updateOne(
        {
            source: 'property-appraiser-consumer',
            state: state,
            county: county
        }, 
        {  
            $set: { processed: false }
        }
    );

    process.exit();
})();