import { MaraResourceCluster } from "../MapAnalysis/MaraResourceCluster";
import { MaraResourceType } from "../MapAnalysis/MaraResourceType";

export class TargetExpandData {
    Cluster: MaraResourceCluster | null;
    ResourceType: MaraResourceType[] = [];

    constructor(cluster: MaraResourceCluster | null, resourceType: MaraResourceType[]) {
        this.Cluster = cluster;
        this.ResourceType = resourceType;
    }
}
