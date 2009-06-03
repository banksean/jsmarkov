
var Markov = function() {

	// Matrix maps {word pair separated by space} to {PobabilitySet}
	this.matrix = new Object();
	
	this.matrix.get = function(index) {
		for (var key in this) {
			if (key == index) { return this[key]; }
		}
	}
};

var stripHtml = /<\S[^><]*>/g;
var stripPunctuationRE = /[^A-Za-z0-9]/;
var trimWhitespace = /^\s+|\s+$/;
var fixQuotesRE = /\\"/;

String.prototype.trim = function() {
	return this.replace(trimWhitespace, '');
}

Markov.prototype.train = function (text) {
	//trim the text to get rid of trailing whitespace
	var words = text.split(/\s/);
	
	// Get two good starting words (non-whitespace).
	var lastWordA = "",  lastWordB = "";

	var i = 0;
	for (; i<words.length && lastWordA != ""; i++) {
		lastWordA = words[i].trim();
	}
	
	for (; i<words.length && lastWordB != ""; i++) {
		lastWordB = words[i].trim();
	}	
	
	// Now scan the rest of the words.
	for (i=0; i<words.length; i++) {
		var currentWord = words[i].trim();
		if (currentWord != "") {
			this.increment_(lastWordA, lastWordB, currentWord);		
			lastWordA = lastWordB;
			lastWordB = currentWord;		
		}
	}
};

Markov.prototype.train_chunk = function(words) {
	// Get two good starting words (non-whitespace).
	this.lastWordA = this.lastWordA || "";
	this.lastWordB = this.lastWordB || "";

	// Get two good starting words if there aren't already some left
	// from the last chunk.
	var i = 0;
	for (; i<words.length && this.lastWordA != ""; i++) {
		this.lastWordA = words[i].trim();
	}
	
	for (; i<words.length && this.lastWordB != ""; i++) {
		this.lastWordB = words[i].trim();
	}	
	
	// Now scan the rest of the words.
	for (i=0; i<words.length; i++) {
		var currentWord = words[i].trim();
		if (currentWord != "") {
			this.increment_(this.lastWordA, this.lastWordB, currentWord);		
			this.lastWordA = this.lastWordB;
			this.lastWordB = currentWord;		
		}
	}
	
};

Markov.prototype.trainAsyncWorker_ = function() {
	this.i = this.i || 0;
	var chunk = this.words_.slice (this.i*this.chunkSize_, (this.i+1)*this.chunkSize_);
	this.train_chunk(chunk);
	if (this.progress_callback_) {
		this.progress_callback_(this.i+1, Math.ceil(this.words_.length/this.chunkSize_));
	}
	
	this.i++;
	
	if (this.i < this.words_.length/this.chunkSize_) {
		setTimeout(createBoundWrapper(this, this.trainAsyncWorker_), this.sleepTime_);
	} else {
		this.finished_training_callback_();
	}
};

// http://www.alistapart.com/articles/getoutbindingsituations
function createBoundWrapper(object, method) {
  return function() {
    return method.apply(object, arguments);
  };
}

Markov.prototype.trainAsync = function (text, finished_callback, opt_progress_callback) {
	//trim the text to get rid of trailing whitespace
	var t1 = new Date().getTime();
	this.words_ = text.split(/\s/);
	var t2 = new Date().getTime();
	//console.log("time to split: " + (t2-t1));
	
	this.chunkSize_ = 1000;
	this.sleepTime_ = 100;
	
	t1 = new Date().getTime();	
	
	this.finished_training_callback_ = finished_callback;
	this.progress_callback_ = opt_progress_callback;
	
	setTimeout(createBoundWrapper(this, this.trainAsyncWorker_), this.sleepTime_);
};


Markov.prototype.increment_ = function(lastWordA, lastWordB, currentWord) {
	var index = lastWordA + " " + lastWordB;
	if (!this.matrix[index]) { this.matrix[index] = new ProbabilitySet(); }
	this.matrix[index].increment(currentWord);
};

Markov.prototype.generate = function(startWords, length) {
	var lastWordA = startWords[0];
	var lastWordB = startWords[1];
	var results = "";
	for (var i=0; i<length; i++) {
		var nextWord = this._selectRandomNext(lastWordA, lastWordB);
		if (!nextWord) return results;
		results += " " + nextWord;
		lastWordA = lastWordB;
		lastWordB = nextWord;
	}
	
	return results;
};

Markov.prototype.generateWorker_ = function() {
	this.j = this.j || 0;

	this.results = this.results || "";
	for (var i=0; i<this.generateChunkSize_; i++) {
		var nextWord = this._selectRandomNext(this.lastWordA, this.lastWordB);
		if (!nextWord) {
			this.generateFinishedCallback_();
		} else {
			this.results += " " + nextWord;
			this.lastWordA = this.lastWordB;
			this.lastWordB = nextWord;
		}
	}
	
	if (this.generateProgressCallback_) {
		this.generateProgressCallback_(this.results);
	}
	
	this.j++;
	
	if (this.j < this.requestedLength_/this.generateChunkSize_) {
		setTimeout(createBoundWrapper(this, this.generateWorker_), this.sleepTime_);
	} else {
		this.generateFinishedCallback_();
	}	
};

Markov.prototype.generateAsync = function(startWords, length, finishedCallback, progressCallback) {
	this.requestedLength_ = length;
	this.generateProgressCallback_ = progressCallback;
	this.generateFinishedCallback_ = finishedCallback;
	this.sleepTime_ = 200;
	this.generateChunkSize_ = 1;
	
	this.lastWordA = startWords[0];
	this.lastWordB = startWords[1];
	this.j = 0;
	this.results = null;
	
	setTimeout(createBoundWrapper(this, this.generateWorker_), this.sleepTime_);	
};

Markov.prototype.randomStart = function() {
	var index = Math.round(Math.random()*(this._count(this.matrix)-1));
	for (word in this.matrix) { 
		if (index-- == 0) {
			var ret = word.split(" ");
			return ret; 
		}
	}	
}

// strip the input text of punctuation
// lowercase it
// filter out stop words
// iterate over all pair-wise combinations of the words
// 	for each, see if there's an entry starting with it in the matrix
//	if so, add it to a list of candidates
// if the candidate list is emtpy:
// 	search for candidates base on single words
// if the candidate list is *still* empty, return a random seed
// otherwise, randomly select a candidate from the list
Markov.prototype.suggestSeed = function(seedWords) {
	var words = seedWords.toLowerCase().split(" ");
	var candidates = new Array();
	var filteredWords = new Array();
	
	// TODO: strip stop words
	for (var i=0; i<words.length; i++) {
		var w = words[i];
		if (!stopWords[w]) {
			filteredWords.push(w);
		}
	}
	
	words = filteredWords;
	
	// Search matrix for starting point using pairwise combinations of seedWords.
	for (var i=0; i<words.length; i++) {
		var a = words[i];
		for (var j=i+1; j<words.length; j++) {
			var b = words[j];
			var ret = this.matrix[a + " " + b];
			if (ret) candidates.push([a, b]);
			ret = this.matrix[b + " " + a];
			if (ret) candidates.push([b, a]);
		}
	}
	
	// Search for single words
	if (candidates.length == 0) {
		for (var i=0; i<words.length; i++) {
			for (var seed in this.matrix) {
				if (seed.indexOf(words[i]) != -1) {
					candidates.push(seed.split(" "));
				}
			}
		}
	}
	
	if (candidates.length > 0) {
		return candidates[Math.round(Math.random()*(candidates.length-1))];		
	} else {
		return this.randomStart();
	}
}

Markov.prototype._selectRandomNext = function(a, b) {
	var nextList = this.matrix.get((a + " " + b));
	if (!nextList) return null;
	
	return nextList.selectRandom();
};

// so stupid that JS associative arrays don't support this directly. 
// TODO: memoize to speed this up
Markov.prototype._count = function(v) {
	if (v.memoizedCount_) {
		return v.memoizedCount_;
	}
	v.memoizedCount_ = 0;
	for (var a in v) {
		if (v != "memoizedCount_") {
			v.memoizedCount_++;
		}
	}
	
	return v.memoizedCount_;
};
