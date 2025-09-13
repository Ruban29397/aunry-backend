const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Video = require('../models/Video');
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');

const router = express.Router();

// Set up storage for uploaded videos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB file size limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|mp4|mov|avi|wmv|flv/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb('Error: Videos and Images Only!');
        }
    }
}).fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);


// @route   POST api/videos/upload
// @desc    Upload a new video (admin only)
// @access  Private (Admin)
router.post('/upload', auth, admin, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error(err);
            return res.status(400).json({ msg: err });
        }
        if (!req.files || !req.files['video'] || !req.files['thumbnail']) {
            return res.status(400).json({ msg: 'Please upload a video and a thumbnail' });
        }

        const { title, description } = req.body;
        const videoFile = req.files['video'][0];
        const thumbnailFile = req.files['thumbnail'][0];

        try {
            const newVideo = new Video({
                title,
                description,
                videoUrl: `/uploads/${videoFile.filename}`,
                thumbnailUrl: `/uploads/${thumbnailFile.filename}`
            });

            const video = await newVideo.save();
            res.json(video);
        } catch (error) {
            console.error(error.message);
            res.status(500).send('Server error');
        }
    });
});

// @route   GET api/videos/stream/:filename
// @desc    Stream a video file
// @access  Public
router.get('/stream/:filename', (req, res) => {
    const videoPath = `uploads/${req.params.filename}`;
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunkSize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
});

// @route   GET api/videos
// @desc    Get all videos
// @access  Public
router.get('/', async (req, res) => {
    try {
        const videos = await Video.find().sort({ uploadDate: -1 });
        res.json(videos);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/videos/:id
// @desc    Get video by ID
// @access  Public
router.get('/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ msg: 'Video not found' });
        }
        res.json(video);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Video not found' });
        }
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/videos/view/:id
// @desc    Increment view count for a video
// @access  Public
router.put('/view/:id', async (req, res) => {
    try {
        let video = await Video.findById(req.params.id);
        if (!video) {
            return res.status(404).json({ msg: 'Video not found' });
        }

        video.viewCount += 1;
        await video.save();

        res.json(video);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Video not found' });
        }
        res.status(500).send('Server Error');
    }
});

module.exports = router;

