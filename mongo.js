import log4js from 'log4js';
import { MongoClient, ObjectId } from 'mongodb';

const logger = log4js.getLogger('mongo');
const collection = 'art';

class Mongo {
  constructor(host, port, user, pass) {
    this.host = host;
    this.port = port;
    this.user = user;
    this.pass = pass;

    // Set this client to a Promise, which we will resolve later during initialization.
    this.client = MongoClient.connect(`mongodb://${user}:${pass}@${host}:${port}`, {
      useUnifiedTopology: true,
    });
  }

  initialize = async () => {
    // Prevent multiple initialization routines
    if (this.db) return;

    try {
      const client = await this.client;
      this.db = client.db(collection);
    } catch (err) {
      logger.error(err);
      throw new Error(`Could not connect to MongoDB`);
    }
  };

  findDocument = async (id) => {
    // Attempt to initialize
    await this.initialize();

    try {
      const document = await this.db.collection(collection).findOne({ _id: ObjectId(id) });
      return document;
    } catch (err) {
      logger.error(err);
      throw new Error(`Could not find document, ${id}`);
    }
  };

  findAllDocuments = async () => {
    // Attempt to initialize
    await this.initialize();

    try {
      const documents = await this.db.collection(collection).find({}).toArray();

      return documents;
    } catch (err) {
      logger.error(err);
      throw new Error('Could not find documents');
    }
  };

  updateDocument = async (id, update) => {
    // Attempt to initialize
    await this.initialize();

    try {
      await this.db.collection(collection).updateOne({ _id: ObjectId(id) }, update);
    } catch (err) {
      logger.error(err);
      throw new Error(`Could not update document, ${id}`);
    }
  };
}

export default Mongo;
