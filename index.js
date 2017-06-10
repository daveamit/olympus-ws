const express = require('express');
const debug = require('debug')('olympus-ws');

const PORT = process.env.PORT || 3000;
const admin = require('firebase-admin');
const Device = require('./src/device');
const SocketServer = require('ws').Server;

// list of connected devices.
const devices = {};

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
  const [email, uid, device] = req.url.split('/').filter(part => !!part);

  // this should be (!secure || !email || !uid) ... but secure is always false, not sure why.
  // UPDATE: (this is why ->) Because its hosted under heroku under SSL.
  // So from proxy to the this its just http (not secure)
  // while from client to heroku is https (secure).
  if (!email || !uid || !device) {
    cb(false, 401, `Sorry ${email || device || '<unknown>'}, can't let you in.`);
    return;
  }
  // verify email and uid (do they match) -- a more secure method needs to be implemented here.
  // As we are not allowing unsecure connections (wss only), email and uid are pretty secure.
  admin.auth().getUserByEmail(email)
    .then((userRecord) => {
      if (userRecord.uid === uid) {
        debug(`Client connected: ${email}#${device}`);
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

function heartbeat() {
  debug(`Pong from ${this.email}#${this.device}`);
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true; //eslint-disable-line
  ws.on('pong', heartbeat);
});

// const interval = setInterval(() => {
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;  //eslint-disable-line
    debug(`Pinging ...${ws.email}#${ws.device}`);
    ws.ping('', false, true);
  });
}, 30000);

const buildValue = (pin) => {
  if (pin.inverted) {
    return pin.state === 'ON' ? 0 : 1;
  }
  return pin.state === 'ON' ? 1 : 0;
};
wss.on('connection', (ws, req) => {
  if (!req) {
    debug('Client rejected');
    return;
  }
  const [email, uid, device] = req.url.split('/').filter(part => !!part);
  let lastKnownValue;
  let intrrupts;

  devices[device] = Device(ws);
  devices[device].on((int) => {
    if (intrrupts && intrrupts[int.pin]) {
      const intrrupt = intrrupts[int.pin];
      if (!intrrupt) {
        debug('Intrrupt ignored');
        return;
      }
      if (intrrupt['@condition']) {
        if (!int[intrrupt['@condition']]) {
          debug('Condition did not match, ignoring');
          return;
        }
      }
      devices[device].send(Object.assign({ type: intrrupt['@type'] }, intrrupt, { int }));
    } else {
      debug('intrrupts: ', intrrupts);
      debug(int);
      debug('Intrrupt routines not defined. Ignoring');
    }
  });
  ws.email = email;  // eslint-disable-line
  ws.device = device; // eslint-disable-line
  debug(`Signed up for updated for: ${email}#${device}`);
  const ref = db.child(uid).child('nodes').child(device).ref;
  ws.statusRef = db.child(uid).child('status').child(device); // eslint-disable-line
  ws.statusRef.set('online');

  ref.on('value', (value) => {
    try {
      const newValue = value.val();
      if (!newValue) {
        return;
      }
      intrrupts = newValue['@intrrupts'];
      // Loop through each pin
      Object.keys(newValue).filter(key => !key.startsWith('@')).forEach((pin) => {
        // if pin value changes
        if (!lastKnownValue || newValue[pin].state !== lastKnownValue[pin].state) {
          // emit the command to the device (via wss)
          devices[device].set({ type: newValue[pin]['@type'], pin, value: buildValue(newValue[pin]) });
        }
      });
      // Update last known value.
      lastKnownValue = value.val();
    } catch (e) {
      debug('Client seems to be down', e);
      // just in case ;)
      ref.off();
    }
  });
  // ws.on('message', debug);
  ws.on('close', () => {
    debug(`Client disconnected:- ${email}#${device}`);
    ws.statusRef.remove();
    ref.off();
    delete devices[device];
  });
});
