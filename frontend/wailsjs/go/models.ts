export namespace main {
	
	export class SyncSettings {
	    enabled: boolean;
	    passphrase: string;
	    peerCount: number;
	
	    static createFrom(source: any = {}) {
	        return new SyncSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.passphrase = source["passphrase"];
	        this.peerCount = source["peerCount"];
	    }
	}

}

export namespace store {
	
	export class Clip {
	    id: string;
	    type: string;
	    content?: string;
	    image?: string;
	    length: number;
	    isPinned: boolean;
	    createdAt: string;
	    label: string;
	    isHidden: boolean;
	    source?: string;
	
	    static createFrom(source: any = {}) {
	        return new Clip(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.content = source["content"];
	        this.image = source["image"];
	        this.length = source["length"];
	        this.isPinned = source["isPinned"];
	        this.createdAt = source["createdAt"];
	        this.label = source["label"];
	        this.isHidden = source["isHidden"];
	        this.source = source["source"];
	    }
	}

}

