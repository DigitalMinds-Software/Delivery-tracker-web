const config = {
    development: {
        baseURL: "http://localhost:8000",
    },
    production: {
        baseURL: "https://delivery-tracker-backend-1dyc.onrender.com",
    },
};

const env = process.env.NODE_ENV || 'development';

export default {
    ...config[env],
    env,
};