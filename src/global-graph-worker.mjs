import {globalLayout} from './global-graph-layout.mjs';
self.onmessage=event=>{try{self.postMessage({layout:globalLayout(event.data.nodes,event.data.edges)});}catch(e){self.postMessage({error:e.message});}};
