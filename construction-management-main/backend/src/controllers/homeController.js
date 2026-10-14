function getHome(req, res) {
    res.json({
        message: "Construction Management API running"
    });
}

module.exports = { getHome };
