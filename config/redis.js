const redis = require('redis');
require('dotenv').config();

const redisClient = redis.createClient({
    url: process.env.REDIS_URL
});

redisClient.on('connect', () => console.log('Redis Terhubung'));
redisClient.on('ready', () => console.log('redis siap di gunakan'))
redisClient.on('error', (err) => console.error(' Redis Error', err.code, '->', err.message));

const connectRedis = async () => {
    try {
        await redisClient.connect();
    }catch (err) {
        console.log('Redis tidak tersedia', err.message);
        console.log('API tetap berjalan tanpa cache')
    }
};

module.exports = { redisClient, connectRedis };