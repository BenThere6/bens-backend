const express = require('express');
const router = express.Router();
const {
    sendEmail,
    addEmailToList,
    sendToAll
} = require('../../controllers/alanBirdsallSite/emailController');

// Route to send an email to a specific address (from the contact form)
router.post('/send-email', sendEmail);

// Route to add an email to the mailing list
router.post('/add-email', addEmailToList);

// Route to send an email to all subscribers in the mailing list
router.post('/send-to-list', sendToAll);

module.exports = router;