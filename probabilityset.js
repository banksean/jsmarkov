
/**
 * Maintains a set of {value, probability} tuples, and 
 * lets you pick a random value from the set weighted by 
 * these probabilities.
 * Probabilities are [0,1]
 * You can build a set of probabilities based on frequencies
 * and it normalizes for you.
 */
function ProbabilitySet() {
	this.elements_ = new Array();
	this.elementsByValue_ = {};
}

/**
 * Adds an element to the set.
 * @param {object} v the object to add
 * @param {integer} f the frequency of occurrence of v
 */
ProbabilitySet.prototype.add = function (v, f) {
	this.renormalize_ = true;
	var newEl = {value:v, frequency:f};
	this.elements_.push(newEl);
	this.elementsByValue_[v] = newEl;
}
/**
 * Increments the frequency of v.
 */
ProbabilitySet.prototype.increment = function(v) {
	this.renormalize_ = true;
	if (!this.elementsByValue_[v]) {
		this.add(v, 0);
	}
	this.elementsByValue_[v].frequency++;
}

/**
 * Sets probabilites based on frequencies.
 */
ProbabilitySet.prototype.normalize_  = function() {

	// Get the sum total of all frequencies
	var sum = 0;
	for (var i=0; i<this.elements_.length; i++) {
		sum += this.elements_[i].frequency;
	}
	
	// Normalize probability to [0,1] based on frequency/sum
	for (var i=0; i<this.elements_.length; i++) {
		this.elements_[i].probability = this.elements_[i].frequency/sum;
	}
	
	// Sort descending on probability
	this.elements_.sort(this.sort_);
	this.renormalize_ = false;
}

/**
 * Selects a random value object from the set weighted by its probability
 */
ProbabilitySet.prototype.selectRandom = function() {
	if (this.renormalize_) {
		this.normalize_();
	}
	
	var needle = Math.random();
	for (var i=0; i<this.elements_.length; i++) {
		if ((needle -= this.elements_[i].probability) <= 0.0) {
			return this.elements_[i].value;
		}
	}
	throw "Shouldn't ever run out of elements";
}

ProbabilitySet.prototype.sort_ = function(a, b) {
	return b.probability - a.probability;
}