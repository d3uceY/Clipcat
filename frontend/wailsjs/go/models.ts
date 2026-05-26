export namespace store {
	
	export class Clip {
	    id: string;
	    type: string;
	    content?: string;
	    image?: string;
	    length: number;
	    isPinned: boolean;
	    createdAt: string;
	
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
	    }
	}

}

