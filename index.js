const express = require('express');
const debug = require('debug')('olympus-ws');

const PORT = process.env.PORT || 3000;
const admin = require('firebase-admin');

const SocketServer = require('ws').Server;

const {
  type,
  project_id,
  private_key_id,
  private_key,
  client_email,
  client_id,
  auth_uri,
  token_uri,
  auth_provider_x509_cert_url,
  client_x509_cert_url,
  databaseURL,
} = process.env;

// Fetch the service account keys from env variables.
const serviceAccount = {
  type,
  project_id,
  private_key_id,
  private_key,
  client_email,
  client_id,
  auth_uri,
  token_uri,
  auth_provider_x509_cert_url,
  client_x509_cert_url,
};


// Initialize the app with a service account, granting admin privileges
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL,
});

// As an admin, the app has access to read and write all data, regardless of Security Rules
const db = admin.database().ref();

const server = express()
    .use((req, res) => {
      res.status(400).json('This is not the way to talk to web sockets.');
    })
    .listen(PORT, () => debug(`Listening on ${PORT}`));

const verifyClient = ({ req, secure }, cb) => {
  const [email, uid] = req.url.split('/').filter(part => !!part);
  debug(secure, email, uid);
  if (!email || !uid) {
    cb(false, 401, `Sorry ${email || '<unknown>'}, can't let you in.`);
    return;
  }
  // verify email and uid (do they match) -- a more secure method needs to be implemented here.
  // As we are not allowing unsecure connections (wss only), email and uid are pretty secure.
  admin.auth().getUserByEmail(email)
    .then((userRecord) => {
      if (userRecord.uid === uid) {
        debug('Client connected: ', email);
        cb(true, req);
      } else {
        debug('Client rejected', req.url);
        cb(false, 401, `Sorry ${email || '<unknown>'}, can't let you in.`);
      }
    })
    .catch((error) => {
      debug('Client rejected', req.url);
      cb(false, 401, `Sorry ${email || '<unknown>'}, can't let you in.`);
      debug('Error fetching user data:', error);
    });
};
const wss = new SocketServer({ verifyClient, server });

wss.on('connection', (ws, req) => {
  if (!req) {
    debug('Client rejected');
    return;
  }
  const [email, uid] = req.url.split('/').filter(part => !!part);
  debug('Signed up for updated for: ', email);
  const ref = db.child(uid).ref;
  ref.on('value', (value) => {
    try {
      ws.send(JSON.stringify(value.val()));
    } catch (e) {
      debug('Client seems to be down', e);
      // just in case ;)
      ref.off();
    }
  });
  ws.on('close', () => {
    debug('Client disconnected');
    ref.off();
  });
});
