import { MaraResourceCluster } from "./MapAnalysis/MaraResourceCluster";

export class MaraResourceClusterSelection {
    Optimal: MaraResourceCluster | null;
    IsOptimalClusterReachable: boolean;
    OptimalReachable: MaraResourceCluster | null;

    constructor (
        optimalCluster: MaraResourceCluster | null, 
        isOptimalClusterReachable: boolean,
        reachableCluster: MaraResourceCluster | null
    ) {
        this.Optimal = optimalCluster;
        this.IsOptimalClusterReachable = isOptimalClusterReachable;
        this.OptimalReachable = reachableCluster;
    }
}