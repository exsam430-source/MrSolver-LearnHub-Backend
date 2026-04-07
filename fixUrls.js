// fixUrls.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const OLD_URL = 'http://localhost:5000';
const NEW_URL = 'https://mrsolver-learnhub-backend-production.up.railway.app';

const fixUrls = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;

    // Fix Users
    const usersResult = await db.collection('users').updateMany(
      { avatar: { $regex: 'localhost' } },
      [{
        $set: {
          avatar: {
            $replaceOne: {
              input: '$avatar',
              find: OLD_URL,
              replacement: NEW_URL
            }
          }
        }
      }]
    );
    console.log(`✅ Users fixed: ${usersResult.modifiedCount}`);

    // Fix Courses
    const coursesResult = await db.collection('courses').updateMany(
      { thumbnail: { $regex: 'localhost' } },
      [{
        $set: {
          thumbnail: {
            $replaceOne: {
              input: '$thumbnail',
              find: OLD_URL,
              replacement: NEW_URL
            }
          }
        }
      }]
    );
    console.log(`✅ Courses fixed: ${coursesResult.modifiedCount}`);

    // Fix Payments
    const paymentsResult = await db.collection('payments').updateMany(
      { screenshot: { $regex: 'localhost' } },
      [{
        $set: {
          screenshot: {
            $replaceOne: {
              input: '$screenshot',
              find: OLD_URL,
              replacement: NEW_URL
            }
          }
        }
      }]
    );
    console.log(`✅ Payments fixed: ${paymentsResult.modifiedCount}`);

    // Fix Certificates
    const certsResult = await db.collection('certificates').updateMany(
      { certificateUrl: { $regex: 'localhost' } },
      [{
        $set: {
          certificateUrl: {
            $replaceOne: {
              input: '$certificateUrl',
              find: OLD_URL,
              replacement: NEW_URL
            }
          }
        }
      }]
    );
    console.log(`✅ Certificates fixed: ${certsResult.modifiedCount}`);

    console.log('\n🎉 All URLs fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

fixUrls();