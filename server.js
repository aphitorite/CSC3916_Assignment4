/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');
var mongoose = require('mongoose');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: `Successfully created new user with username, '${user.username}'.`})
        });
    }
});

router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token, username: user.username});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

// Movie routes without param (GET route only)

router.route('/movies')
    .get(authJwtController.isAuthenticated, (req, res) => {
        var joinReviews = req.query.reviews === 'true';

        if(joinReviews) {
            Movie.aggregate([
                {
                    $lookup: { // join on _id and movieId fields
                        from: "reviews", 
                        localField: "_id", 
                        foreignField: "movieId", 
                        as: "reviews" 
                    }
                },
                {
                  $addFields: {
                    avgRating: { $avg: '$reviews.rating' }
                  }
                },
                {
                  $sort: { avgRating: -1 }
                }
            ])
            .exec((err, result) => {
                if(err) return res.status(400).send(err);

                else if(result.length == 0) 
                    return res.status(404).send({success: false, message: `Movie not found.`});
                
                else return res.status(200).json(result);
            });
        }
        else {
            Movie.find().select('title releaseDate genre actors imageUrl').exec((err, movieList) => {
                if(err) return res.send(err);
                return res.status(200).json(movieList);
            });
        }
    })
    .post(authJwtController.isAuthenticated, (req, res) => { // POST: saves a movie
        var movie = Movie();
        movie.title = req.body.title;
        movie.releaseDate = req.body.releaseDate;
        movie.genre = req.body.genre;
        movie.actors = req.body.actors;
        movie.imageUrl = req.body.imageUrl;

        movie.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.status(400).json({ success: false, message: 'A movie with that name already exists.'});
                else
                    return res.status(400).json(err);
            }
            else return res.status(201).json({success: true, msg: 'Successfully created new movie.'})
        });
    })
    .all(authJwtController.isAuthenticated, (req, res) => {  // Any other HTTP Method
        res.status(405).send({ message: 'HTTP method not supported.' });
    });

// Movie routes with param

router.route('/movies/:movieparam')
    .get(authJwtController.isAuthenticated, (req, res) => { // GET: returns specified movie with review
        var joinReviews = req.query.reviews === 'true';
        var movieId = req.params.movieparam;

        if(joinReviews) {
            Movie.aggregate([
                {
                    $match: { _id: mongoose.Types.ObjectId(movieId) } // select movie id
                },
                {
                    $lookup: { // join on _id and movieId fields
                        from: "reviews", 
                        localField: "_id", 
                        foreignField: "movieId", 
                        as: "reviews" 
                    }
                },
                {
                  $addFields: {
                    avgRating: { $avg: '$reviews.rating' }
                  }
                }
            ])
            .exec((err, result) => {
                if(err) return res.status(400).send(err);
    
                else if(result.length == 0) 
                    return res.status(404).send({success: false, message: `Movie not found.`});
                
                else return res.status(200).json(result);
            });
        }
        else {
            Movie.findOne({ _id: mongoose.Types.ObjectId(movieId) })
            .select('title releaseDate genre actors imageUrl').exec((err, movie) => {
                if(err) return res.status(400).send(err);
    
                else if(movie === null) 
                    return res.status(404).send({success: false, message: `Movie not found.`});
                
                else return res.status(200).json(movie);
            });
        }
    })
    .put(authJwtController.isAuthenticated, (req, res) => {
        try {
            var movieId = mongoose.Types.ObjectId(req.params.movieparam);
        }
        catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }
        Movie.findOne({ _id: movieId }).exec((err, movie) => {
            if(err) return res.status(400).json({ success: false, message: err });

            else if(movie == null) 
                return res.status(404).json({ success: false, message: 'Movie not found.' });
    
            else {
                if(req.body.title != null) 
                    movie.title = req.body.title;
                if(req.body.releaseDate != null) 
                    movie.releaseDate = req.body.releaseDate;
                if(req.body.genre != null) 
                    movie.genre = req.body.genre;
                if(req.body.actors != null)
                    movie.actors = req.body.actors;
                if(req.body.imageUrl != null)
                    movie.imageUrl = req.body.imageUrl;
        
                Movie.replaceOne({ _id: movieId }, movie)
                .exec((err, result) => {
                    if(err) return res.status(400).send({ success: false, ...err });
                    else return res.status(200).json({ success: true, message: "Movie updated." });
                });
            }
        });
    })
    .delete(authJwtController.isAuthenticated, (req, res) => {
        var movieId = req.params.movieparam;

        Movie.deleteOne({ _id: mongoose.Types.ObjectId(movieId) })
        .exec((err, result) => {
            if(err) return res.status(400).send(err);

            else if(result.deletedCount == 0)
                res.status(404).json({ message: "Movie not found." });

            else return res.status(200).json({ message: "Movie deleted." });
        });
    })
    .all((req, res) => {  // Any other HTTP Method
        res.status(405).send({ message: 'HTTP method not supported.' });
    });

// Reviews route

router.route('/movies/:movieparam/reviews')
    .post(authJwtController.isAuthenticated, (req, res) => { // POST: saves a movie review from req body
        var movieId = req.params.movieparam;

        Movie.findOne({ _id: movieId }).exec((err, movie) => {
            if(err) return res.status(400).send(err);

            else if(movie === null) 
                return res.status(404).send({success: false, message: `Movie not found.`});
            
            else {
                var newReview = Review();

                newReview.movieId = movie._id;
                newReview.username = req.body.username;
                newReview.review = req.body.review;
                newReview.rating = req.body.rating;

                newReview.save((err) => {
                    if(err) return res.status(400).json({success: false, message: err});
                    return res.status(201).json(newReview);
                });
            }
        });
    })
    .all((req, res) => {  // Any other HTTP Method
        res.status(405).send({ message: 'HTTP method not supported.' });
    });
    

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only


