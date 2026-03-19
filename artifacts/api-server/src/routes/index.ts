import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { csRouter } from "./crowdstrike";

const router: IRouter = Router();

router.use(healthRouter);
router.use(csRouter);

export default router;
