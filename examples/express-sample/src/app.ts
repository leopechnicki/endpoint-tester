import express, { Request, Response, Router } from 'express';

const app = express();
app.use(express.json());

// --- Users router ---
const usersRouter = Router();

usersRouter.get('/', (req: Request, res: Response) => {
  const { page, limit } = req.query;
  res.json({ users: [], page: page ?? 1, limit: limit ?? 20 });
});

usersRouter.post('/', (req: Request, res: Response) => {
  const { name, email, role } = req.body;
  res.status(201).json({ id: 1, name, email, role });
});

usersRouter.get('/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: 'Alice' });
});

usersRouter.put('/:id', (req: Request, res: Response) => {
  const { name, email } = req.body;
  res.json({ id: req.params.id, name, email });
});

usersRouter.delete('/:id', (req: Request, res: Response) => {
  res.status(204).send();
});

usersRouter.get('/:id/orders', (req: Request, res: Response) => {
  res.json({ userId: req.params.id, orders: [] });
});

// --- Products router ---
const productsRouter = Router();

productsRouter.get('/', (_req: Request, res: Response) => {
  res.json({ products: [] });
});

productsRouter.post('/', (req: Request, res: Response) => {
  const { name, price, category } = req.body;
  res.status(201).json({ id: 1, name, price, category });
});

productsRouter.get('/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id, name: 'Widget', price: 9.99 });
});

productsRouter.patch('/:id', (req: Request, res: Response) => {
  const { price } = req.body;
  res.json({ id: req.params.id, price });
});

productsRouter.delete('/:id', (req: Request, res: Response) => {
  res.status(204).send();
});

// --- Health check ---
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Mount routers
app.use('/api/users', usersRouter);
app.use('/api/products', productsRouter);

export default app;

if (process.argv[1] === new URL(import.meta.url).pathname) {
  app.listen(3000, () => {
    console.log('Express sample server running on http://localhost:3000');
  });
}
