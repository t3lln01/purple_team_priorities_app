import { Router, type IRouter } from "express";
import healthRouter    from "./health";
import { csRouter }   from "./crowdstrike";
import { exportRouter } from "./export";
import { accessRouter } from "./access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(csRouter);
router.use(exportRouter);
router.use(accessRouter);

export default router;
