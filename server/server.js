import Koa from 'koa';
import statickoa from 'koa-static';
import { bodyParser } from '@koa/bodyparser';
import { OAuth2Client } from 'google-auth-library';
import { writeFile, readFile, opendir, mkdir } from 'fs/promises';
import Router from '@koa/router';
import multer from '@koa/multer';

const client = new OAuth2Client();
const verifyToken = async (token) => {
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: '108028336132-s1j25jmsu1d222ovrabdk2kcbvkie474.apps.googleusercontent.com'
        });
        const payload = ticket.getPayload();
        const userid = payload['sub'];
        return { userid, payload };
    }
    catch (error) {
        return null;
    }
};

const write = async (file, data) => {
    await writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
};
const read = async (file) => {
    let data;
    try {
        data = JSON.parse(await readFile(file, 'utf-8'));
    }
    catch (error) {
        data = {};
    }
    return data;
};
class DataStore {
    busy = false;
    queue = [];
    file;
    storageType;
    constructor(file, storageType) {
        this.file = file;
        this.storageType = storageType || 'Object';
    }
    async put(data) {
        return new Promise((resolve) => {
            this.queue.push({ type: 'write', data, resolve });
            this.runQueue();
        });
    }
    async get() {
        return new Promise((resolve) => {
            this.queue.push({ type: 'read', resolve });
            this.runQueue();
        });
    }
    async runQueue() {
        if (this.busy) {
            return;
        }
        this.busy = true;
        await this.processQueue();
        this.busy = false;
    }
    async processQueue() {
        const { type, data, resolve } = this.queue.shift();
        if (type === 'update' || type === 'write') {
            await write(`./.database/${this.file}.json`, data);
            resolve();
        }
        else if (type === 'read') {
            const data = await read(`./.database/${this.file}.json`);
            if (!data) {
                if (this.storageType === 'Array') {
                    resolve([]);
                }
                else {
                    resolve({});
                }
            }
            else {
                resolve(data);
            }
        }
        if (this.queue.length > 0) {
            return this.processQueue();
        }
    }
}

try {
    const dirent = await opendir('./.database/invoices');
    await dirent.close();
}
catch (error) {
    await mkdir('./.database/invoices', { recursive: true });
}
const jobsStore = new DataStore('jobs');
const companiesStore = new DataStore('companies');
const invoicesStore = new DataStore('invoices');
const usersStore = new DataStore('users');
const bannedUsersStore = new DataStore('bannedUsers');
new Date().getFullYear();
let promises = [
    jobsStore.get(),
    companiesStore.get(),
    invoicesStore.get(),
    usersStore.get(),
    bannedUsersStore.get()
];
promises = await Promise.all(promises);
const jobs$1 = promises[0];
const companies$1 = promises[1];
const invoices$1 = promises[2];
const users$1 = promises[3];
const bannedUsers = promises[4];

const isAuthenticated = async (ctx, next) => {
    const token = ctx.request.headers['Authorization'] || ctx.request.headers['authorization'];
    if (!token) {
        ctx.status = 401;
        ctx.body = { error: 'Unauthorized' };
        return;
    }
    const verified = await verifyToken(token);
    if (!verified) {
        ctx.status = 401;
        ctx.body = { error: 'Unauthorized' };
        return;
    }
    if (bannedUsers[verified.userid]) {
        ctx.status = 403;
        ctx.body = { error: 'Forbidden' };
        return;
    }
    ctx.state.userid = verified.userid;
    ctx.state.googleProfile = verified.payload;
    await next();
};

const router$6 = new Router({
    prefix: '/api/companies'
});
router$6.get('/', async (ctx) => {
    ctx.body = companies$1;
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
router$6.post('/', async (ctx) => {
    const { name, description, logo, place } = ctx.request.body;
    const company = {
        name,
        description,
        logo,
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const uuid = ctx.request.body.uuid || crypto.randomUUID();
    companies$1[uuid] = company;
    await companiesStore.put(companies$1);
    ctx.body = { content: company, uuid };
    ctx.status = 201;
    ctx.set('Content-Type', 'application/json');
});
var companies = router$6.routes();

const upload = multer({
    storage: multer.diskStorage({
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        },
        destination: async (req, file, cb) => {
            const dir = `./.database/invoices/${new Date().getFullYear()}/images`;
            try {
                const dirent = await opendir(dir);
                await dirent.close();
            }
            catch (error) {
                await mkdir(dir, { recursive: true });
            }
            cb(null, dir);
        }
    })
});
const router$5 = new Router({
    prefix: '/api/invoices'
});
router$5.get('/', async (ctx) => {
    ctx.body = invoices$1;
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
router$5.post('/', async (ctx) => {
    const { name, description, invoiceImages, company, job, user, notes } = ctx.request.body;
    const year = new Date().getFullYear();
    if (!name || !description || !invoiceImages || !company || !job || !user) {
        ctx.status = 400;
        ctx.body = { error: 'Missing required fields' };
        return;
    }
    const invoice = {
        name,
        description,
        invoiceImages,
        company,
        job,
        user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        year,
        notes
    };
    const uuid = ctx.request.body.uuid || crypto.randomUUID();
    invoices$1[uuid] = invoice;
    await invoicesStore.put(invoices$1);
    ctx.body = { content: invoice, uuid };
    ctx.body = invoice;
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
router$5.delete('/:uuid', async (ctx) => {
    const uuid = ctx.params.uuid;
    if (!uuid) {
        ctx.status = 400;
        ctx.body = { error: 'UUID is required' };
        return;
    }
    delete invoices$1[uuid];
    await invoicesStore.put(invoices$1);
    ctx.status = 204;
});
router$5.post('/upload', upload.array('files'), async (ctx) => {
    const files = ctx.files;
    if (!files || files.length === 0) {
        ctx.status = 400;
        ctx.body = { error: 'No files uploaded' };
        return;
    }
    ctx.body = files.map((file) => file.path);
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
var invoices = router$5.routes();

const router$4 = new Router({
    prefix: '/api/job'
});
router$4.get('/:uuid', async (ctx) => {
    const uuid = ctx.params.uuid;
    if (!uuid) {
        ctx.status = 400;
        ctx.body = { error: 'UUID is required' };
        return;
    }
    ctx.body = jobs$1[uuid] || {};
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
var job = router$4.routes();

const router$3 = new Router({
    prefix: '/api/jobs'
});
router$3.get('/', async (ctx) => {
    ctx.body = jobs$1;
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
router$3.post('/', async (ctx) => {
    const { name, description, place } = ctx.request.body;
    const uuid = ctx.request.body.uuid || crypto.randomUUID();
    const job = { name, description, place, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    jobs$1[uuid] = job;
    await jobsStore.put(jobs$1);
    ctx.body = { uuid, content: job };
    ctx.status = 201;
    ctx.set('Content-Type', 'application/json');
});
router$3.delete('/:uuid', async (ctx) => {
    const uuid = ctx.params.uuid;
    if (!uuid) {
        ctx.status = 400;
        ctx.body = { error: 'UUID is required' };
        return;
    }
    delete jobs$1[uuid];
    await jobsStore.put(jobs$1);
    ctx.status = 204;
});
var jobs = router$3.routes();

const router$2 = new Router({
    prefix: '/api/users'
});
router$2.get('/:uuid', async (ctx) => {
    const uuid = ctx.params.uuid;
    if (!uuid) {
        ctx.status = 400;
        ctx.body = { error: 'UUID is required' };
        return;
    }
    ctx.body = users$1[uuid] || {};
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
router$2.get('/', async (ctx) => {
    ctx.body = users$1;
    ctx.status = 200;
    ctx.set('Content-Type', 'application/json');
});
var users = router$2.routes();

const hasRole = (userid, role) => {
    if (!userid || !users$1[userid].roles)
        return false;
    return users$1[userid].roles.includes(role);
};
const grantRole = async (userid, role) => {
    if (!userid || !users$1[userid].roles)
        return false;
    if (users$1[userid].roles.includes(role))
        return false;
    users$1[userid].roles.push(role);
    await usersStore.put(users$1);
};
const revokeRole = async (userid, role) => {
    if (!userid || !users$1[userid].roles)
        return false;
    if (!users$1[userid].roles.includes(role))
        return false;
    users$1[userid].roles = users$1[userid].roles.filter((r) => r !== role);
    await usersStore.put(users$1);
};

const router$1 = new Router({
    prefix: '/api/roles'
});
router$1.use(async (ctx, next) => {
    if (!hasRole(ctx.state.userid, 'roles') && !hasRole(ctx.state.userid, 'admin')) {
        ctx.status = 403;
        ctx.body = { error: 'Forbidden' };
        return;
    }
    await next();
});
router$1.post('/grant/:uuid/:role', async (ctx) => {
    await grantRole(ctx.params.uuid, ctx.params.role);
    ctx.status = 200;
});
router$1.post('/revoke/:uuid/:role', async (ctx) => {
    await revokeRole(ctx.params.uuid, ctx.params.role);
    ctx.status = 200;
});
var roles = router$1.routes();

const router = new Router({
    prefix: '/api/register'
});
router.use(async (ctx, next) => {
    if (users$1[ctx.state.userid]) {
        ctx.status = 403;
        ctx.body = { error: 'Forbidden, already registered.' };
        return;
    }
});
router.post('/', async (ctx, next) => {
    users$1[ctx.state.userid] = {
        name: ctx.request.body.name || ctx.state.googleProfile.name,
        email: ctx.request.body.email || ctx.state.googleProfile.email,
        picture: ctx.request.body.picture || ctx.state.googleProfile.picture,
        place: ctx.request.body.place || '',
        phone: ctx.request.body.phone || ctx.state.googleProfile.phone || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    await usersStore.put(users$1);
});
var register = router.routes();

var isUser = async (ctx, next) => {
    if (!users$1[ctx.state.userid]) {
        ctx.status = 403;
        ctx.body = { error: 'Forbidden, register first.' };
        return;
    }
    await next();
};

const api = new Koa();
// static files server
api.use(statickoa('www'));
// middleware
api.use(bodyParser());
// internal middleware
// set/check the user id & see if the user is authenticated
api.use(isAuthenticated);
// this middleware is used to register the user after authentication
api.use(register);
// everything after this point requires a user account
api.use(isUser);
// main routes
api.use(users);
api.use(roles);
api.use(companies);
api.use(invoices);
api.use(jobs);
api.use(job);
api.listen(5678, () => {
    console.log('Server is running on http://localhost:5678');
});
