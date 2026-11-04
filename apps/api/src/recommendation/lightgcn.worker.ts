import { parentPort, workerData } from 'node:worker_threads'
import { trainLightGCN, type GraphEdge } from './lightgcn'
const input = workerData as { edges: GraphEdge[]; itemIds: string[] }
parentPort?.postMessage(trainLightGCN(input.edges, { itemIds: input.itemIds }))
