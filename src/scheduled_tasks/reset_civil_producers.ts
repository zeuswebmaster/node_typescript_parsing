// cron(50 13 * * ? *)
require('dotenv').config();

import db from '../models/db';

( async () => {
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'civil'
        }, 
        { 
            '$set': 
            { 
                processed: false 
            } 
        }
    );

    let counties = ['broward'];
    
    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'csv-imports',
        },
        { 
            '$set': 
            { 
                processed: true 
            } 
        }
    );

    await db.models.PublicRecordProducer.updateMany(
        {
            source: 'csv-imports',
            state: 'FL',
            county: { $in : counties }
        },
        { 
            '$set': 
            { 
                processed: false 
            } 
        }
    );

    process.exit();
})();