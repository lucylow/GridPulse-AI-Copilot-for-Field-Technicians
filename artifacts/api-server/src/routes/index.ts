import { Router, type IRouter } from "express";
import dataRouter from "./data";
import gridpulseRouter from "./gridpulse";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gridpulseRouter);
router.use(dataRouter);

export default router;
