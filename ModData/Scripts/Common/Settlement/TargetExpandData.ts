import { MaraPoint } from "../MaraPoint";
import { MaraResourceCluster } from "../MapAnalysis/MaraResourceCluster";
import { MaraResourceType } from "../MapAnalysis/MaraResourceType";


export class TargetExpandData {
    Cluster: MaraResourceCluster | null;
    ResourceType: MaraResourceType[] = [];
    BuildCenter: MaraPoint | null = null; //TODO: remove this

    constructor(cluster: MaraResourceCluster | null, resourceType: MaraResourceType[]) {
        this.Cluster = cluster;
        this.ResourceType = resourceType;
    }
}
