let Stream = require('stream'),
    path = require('path'),
    gutil = require('gulp-util'),
	_ = require('lodash'),
	fs = require('fs'),
	consolidate = require('consolidate');

const PLUGIN_NAME = 'gulp-filemap-generator';

const fileMapGenerator = options => {
    let config = Object.assign({
        'baseDir':``,
        'template':`map.html`,
        'templatePath' : `./`,
        'title':'-',
        'author':'-',
        'description':'-',
        'stream' : false,
        'hrefBaseDir' : ``,
        'listName' : 'maps',

        'toJson' : false,
        "jsonName" : "maps.json",
        "jsonPath" : `./`
    },options),
    outputFile,
	stream = Stream.PassThrough({
		objectMode: true
    });

    if(!config[config.listName]){
        config[config.listName] = [];
    }

    const getMeta = (res,text)=> res.match(`\\\<meta\\s+[^\\>]*name\=[\\"\\']${text}[\\"\\'].*?\\>`,'im') || [`content='${config[text]}'`];
    const getContent = meta=> meta.match(/content\=[\"\'](.{0,}?)[\"\']/,'im');
    const sortItem = (itemA,itemB) =>{
        const a = itemA.fileName || itemA.folderName;
        const b = itemB.fileName || itemB.folderName;
        return a.toLowerCase() >= b.toLowerCase();
    }
    
    stream._transform = (file, encoding, cb)=>{
        let contents = file.contents.toString().replace(/\n/g,' ').replace(/\r/g,' '),
            filepath = file.path,
            cwd = file.cwd,
            relative = path.relative(cwd, filepath),
            dir = relative.replace(`${config.baseDir}`,''),
            head = contents.match(/\<head\>.+\<\/head\>/im),
            data = null,
            href = dir.replace(config.hrefBaseDir, ''),
            allPath = href.split('\\').reduce((arr,path)=>{
                if(path) arr.push(path);
                return arr
            },[]);

        const initMeta = (head)=>{
            const matchedTitle = head.match(/\<title\>(.{0,}?)\<\/title\>/im);
            data = {
                title : matchedTitle ? matchedTitle[1] : config.title,
                author : getContent(getMeta(head,'author')[0])[1] || config.author,
                description : getContent(getMeta(head,'description')[0])[1] || config.description,
            }
        }

        
        const buildFolder = (folders, depth)=>{
            if((depth+1) >= allPath.length){
                folders.push({
                    "type" : "file",
                    "fileName" : allPath[depth],
                    "parentPath" : allPath[depth-1],
                    "depth" : depth+1,
                    data,
                    href
                });
                folders.sort(sortItem);
            } else {
                const path = allPath[depth];
                const folder = folders.find(f=>f.folderName===path);
                if(folder){
                    buildFolder(folder.children, depth+1);
                } else {
                    const children = [];
                    folders.push({
                        "type" : "folder",
                        "folderName" : path,
                        "parentPath" : allPath[depth-1],
                        "depth" : depth+1,
                        children
                    })
                    folders.sort(sortItem);
                    buildFolder(children, depth+1);
                }
            }
        }
        if(head){
            initMeta(head[0]);
        }

		if (!outputFile && !config.toJson) {
			outputFile = new gutil.File({
				base: file.cwd+config.templatePath,
				cwd: file.cwd,
                path: path.join(file.cwd+config.templatePath, config.template),
				contents: file.isBuffer() ? new Buffer(0) : new Stream.PassThrough()
            });
        }

        buildFolder(config[config.listName],0);
        if(config.stream && this.push){
            this.push(file);
        }
        cb();
    };
    
    stream._flush = (cb)=>{
		if (config[config.listName].length) {
            if(config.toJson){
                const jsonData = JSON.stringify({
                    data : config[config.listName]
                });
                const jsonFile = fs.createWriteStream(
                    path.join(config.jsonDest, `${config.jsonName}.json`,)
                )
                jsonFile.write(Buffer(jsonData));
                jsonFile.end();
                cb();
            } else {
                consolidate['lodash'](path.join(config.templatePath,config.template), {
                    [config.listName] : config[config.listName]
                }, (err, html)=>{
                    if(err){
                        throw new gutil.PluginError(`${err.message} by ${PLUGIN_NAME}`);
                    }
                    let content = Buffer(html);
                    if(outputFile.isBuffer()){
                        outputFile.contents = content;
                    } else {
                        outputFile.contents.write(content);
                        outputFile.contents.end();
                    }
                    stream.push(outputFile);
                    cb();
                });
            }
		} else {
			cb();
		}
	};
    return stream;
}
module.exports = fileMapGenerator;