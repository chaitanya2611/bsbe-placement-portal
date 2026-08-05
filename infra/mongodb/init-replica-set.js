const configuration = {
  _id: 'rs0',
  members: [{ _id: 0, host: 'mongo:27017' }],
};

try {
  const status = rs.status();
  if (status.ok === 1) {
    print('MongoDB replica set rs0 is already initialized.');
  }
} catch (error) {
  if (error.codeName === 'NotYetInitialized') {
    rs.initiate(configuration);
    print('MongoDB replica set rs0 initialization requested.');
  } else {
    throw error;
  }
}

let ready = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    if (rs.status().myState === 1) {
      ready = true;
      break;
    }
  } catch {
    // The election is still in progress.
  }
  sleep(1000);
}

if (!ready) {
  throw new Error('MongoDB replica set did not elect a primary within 30 seconds.');
}

print('MongoDB replica set rs0 is ready.');
