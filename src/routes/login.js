// express initialization
const express = require("express");
const router = express.Router();

// config and controller
require('dotenv').config();
const config = require('../config/app-config.js');
const UsersController = require('../controllers/users.js');
const User = new UsersController();

// required libraries
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const sessionStore = new MySQLStore(config.sqlCon);
const bodyParser = require('body-parser')
const flash = require('express-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cookieParser = require('cookie-parser');
const csurf = require('csurf');

// global middleware
router.use(session({
    name: "juan",
    key: "123",
    secret: "1234556",
    store: sessionStore,
    resave: false,
    saveUninitialized: false
}))

router.use(passport.initialize());
router.use(passport.session());

router.use(async function(req,res,next) {
    res.locals.isAuthenticated = req.isAuthenticated();

    try {
        res.locals.isAdmin = await User.isAdmin(req.session.passport.user);
    } catch {
        res.locals.isAdmin = false;
    }

    next();
});

router.use(bodyParser.json()); // support json encoded bodies

router.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies

router.use(cookieParser());

router.use(csurf({ cookie: true }));

router.use(flash());

// passport configurations
passport.use('local', new LocalStrategy(async function (email, password, done) {
    let user;

    try {
        user = await User.getUserByEmail(email);
    } catch (e) {
        return done(null, false, { message: 'Este correo no se encuentra registrado' })
    }

    try {
        if (await bcrypt.compare(password, user.password)) {
            return done(null, user)
        } else {
            return done(null, false, { message: 'Contraseña incorrecta' })
        }
    } catch (e) {
        return done(e)
    }
}));

passport.serializeUser(function(user, done) {
    done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
    try{
        let user = User.getUserById(id)
        done(null, user);
    } catch (e) {
        throw e;
    }
});

// login page
router.get("/", notAuthenticated(), (req, res) => {
    res.render(`${config.views}/public/login.ejs`, { csrfToken: req.csrfToken() });
});

router.post("/", passport.authenticate('local', {
    successRedirect: '/login',
    failureRedirect: '/login',
    failureFlash: true
}));

// logout
router.get('/logout', function(req, res, next) {
    req.logout(function(err) {
      if (err) { return next(err); }
      res.redirect('/');
    });
  });

// registration page
router.get("/register", (req, res) => {
    res.render(`${config.views}/public/register.ejs`, { csrfToken: req.csrfToken() });
});

router.post("/register", async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        let user = {name: req.body.name, email: req.body.username, password: hashedPassword};
        User.save(user);
        res.redirect('/login');
    } catch {
        res.redirect('/register');
    }
});

// Profile page
router.get("/profile", async (req, res) => {
    const UsersController = require('../controllers/users.js');
    const User = new UsersController();
    let user;
    let msg = req.query.success;

    try {
        user = await User.getUserById(req.session.passport.user);
    } catch (e) {
        throw e;
    }

    res.render(`${config.views}/public/profile.ejs`, {user: user, msg: msg, csrfToken: req.csrfToken() });
});

// Profile update
router.post("/profile", async (req, res) => {
    const UsersController = require('../controllers/users.js');
    const User = new UsersController();
    const userId = req.session.passport.user;

    try {
        await User.update(req.body.name, req.body.email, userId);
        if (req.body.password != "") {
            hashedPassword = await bcrypt.hash(req.body.password, 10);
            User.updatePassword(hashedPassword, userId);
        }
        res.redirect('/login/profile?success=true');
    } catch(e) {
        res.redirect('/login/profile?success=false');
    }
});

// Reset Password Form
router.get("/reset", async (req, res) => {
    let msg = req.query.success;
    res.render(`${config.views}/public/reset.ejs`, {msg: msg, csrfToken: req.csrfToken() });
});

// Reset Password
router.post("/reset", async (req, res) => {
    const UsersController = require('../controllers/users.js');
    const User = new UsersController();

    try {
        user = await User.getUserByEmail(req.body.email);

        const nodemailer = require('nodemailer');

        const randomPass = "12345"
        hashedPassword = await bcrypt.hash(randomPass, 10);
        User.updatePassword(hashedPassword, user.id);

        let transport = nodemailer.createTransport({
            host: "localhost",
            port: "5001",
            auth: {
               user: "Juan",
               pass: "1234"
            }
        });
        const message = {
            from: 'servicio_libreria@utp.edu.co',
            to: user.email,
            subject: 'Restablecer contraseña',
            text: `Hola ${user.name}, Tu contraseña en Flashbook será restablecida\nTu nueva contraseña es: ${randomPass}`
        };

        transport.sendMail(message);

        res.redirect('/login/reset?success=true');
    } catch {
        res.redirect('/login/reset?success=false');
    }

});

// auth verify middleware
function notAuthenticated() {
	return (req, res, next) => {
        if (!req.isAuthenticated()) return next();
        res.redirect('/libros')
	}
}

module.exports = router;