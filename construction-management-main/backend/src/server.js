require("dotenv").config();

const app = require("./app");
const { startNotificationWorker } = require("./services/notificationWorker");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startNotificationWorker(require("./config/database"));
});
