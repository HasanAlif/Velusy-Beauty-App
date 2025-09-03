import nodemailer from "nodemailer";
import config from "../config";

const emailSender = async (email: string, html: string, subject: string) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465, // 2525
    secure: true,
    auth: {
      user: "alifalmehedihasan2@gmail.com",
      pass: "bpfkazkhtzfqfank",
    },
  });

  const info = await transporter.sendMail({
    from: "alifalmehedihasan2@gmail.com",
    to: email,
    subject: subject,
    html,
  });
};

export default emailSender;
