const express = require('express');
const router = express.Router();
const dependencyController = require('../controllers/taskDependencyController');

router.get('/task/:taskId', dependencyController.getDependencies);
router.post('/', dependencyController.createDependency);
router.delete('/:id', dependencyController.deleteDependency);

module.exports = router;
