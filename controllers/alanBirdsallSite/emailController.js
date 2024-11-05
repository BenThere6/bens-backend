const nodemailer = require('nodemailer');
const Email = require('../../models/alanBirdsallSite/EmailModel');

// Configure the transporter for sending emails
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Controller function to send an email (e.g., from a contact form)
exports.sendEmail = async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Name, email, and message are required' });
    }

    const mailOptions = {
        from: email,
        to: process.env.EMAIL_USER, // Your dad's email address
        subject: `Contact Form Submission from ${name}`,
        text: `You received a message from ${name} (${email}):\n\n${message}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ message: 'Failed to send email' });
    }
};

// Controller function to add an email to the mailing list
exports.addEmailToList = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    try {
        const existingEmail = await Email.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'Email already exists in the mailing list' });
        }

        const newEmail = new Email({ email });
        await newEmail.save();
        res.status(201).json({ message: 'Email added to the mailing list' });
    } catch (error) {
        console.error('Error adding email to the list:', error);
        res.status(500).json({ message: 'Failed to add email to the list' });
    }
};

// Controller function to send an email to all subscribers in the mailing list
exports.sendToAll = async (req, res) => {
    const { subject, content } = req.body;

    if (!subject || !content) {
        return res.status(400).json({ message: 'Subject and content are required' });
    }

    try {
        const emailList = await Email.find().select('email -_id');
        const emailAddresses = emailList.map(e => e.email);

        if (emailAddresses.length === 0) {
            return res.status(400).json({ message: 'No subscribers found in the mailing list' });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            bcc: emailAddresses, // Send as BCC to all subscribers
            subject,
            text: content,
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Email sent to all subscribers' });
    } catch (error) {
        console.error('Error sending email to all subscribers:', error);
        res.status(500).json({ message: 'Failed to send email to subscribers' });
    }
};