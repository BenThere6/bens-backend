const express = require('express');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const emailRoutes = require('./routes/alanBirdsallSite/emailRoutes');

dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

const app = express();
app.use(express.json());

// Use the email routes
app.use('/api/alanBirdsallSite/emails', emailRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});