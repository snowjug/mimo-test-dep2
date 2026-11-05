const outageService = require("../services/outage.service");

const getPublicOutages = async (req, res) => {
  try {
    const status = await outageService.getOutageStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postNotifyWhenAvailable = async (req, res) => {
  try {
    const { email, scope } = req.body || {};
    const result = await outageService.subscribeCustomerEmail({ email, scope });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getAdminOutages = async (req, res) => {
  try {
    const [status, pendingSubscribers] = await Promise.all([
      outageService.getOutageStatus(),
      outageService.getPendingSubscriberCount(),
    ]);
    res.json({ ...status, pendingSubscribers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postAdminOutages = async (req, res) => {
  try {
    const updated = await outageService.updateOutageStatus(req.body, req.admin?.email || "admin");
    const pendingSubscribers = await outageService.getPendingSubscriberCount();
    res.json({ ...updated, pendingSubscribers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getPublicOutages,
  postNotifyWhenAvailable,
  getAdminOutages,
  postAdminOutages,
};
