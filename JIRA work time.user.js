// ==UserScript==
// @name       JIRA work time
// @namespace  https://github.com/JonathanGawrych/jira-non-working-hours
// @version    0.2.0
// @description  Mark Non-Working Hours as such in jira's burndown chart
// @match      https://jira.mtc.byu.edu/jira/secure/RapidBoard.jspa*
// @copyright  2014+, Jonathan Gawrych
// ==/UserScript==


// limit to the query param
if (/\bchart=burndownChart\b/.test(location.search)) {

var MILLI_PER_DAY = 1000 * 60 * 60 * 24;
var MILLI_PER_MIN = 1000 * 60;

var employeeHours = [
    {}, // sun
    {   // mon
        Jon: [{clockIn: 13, clockOut: 17}],
        Erik: [{clockIn: 16.5, clockOut: 18.5}],
        Nathan: [{clockIn: 14, clockOut: 17}],
        Teancum: [{clockIn: 12.5, clockOut: 13.5}]
    },
    {   // tue
        Jon: [{clockIn: 11, clockOut: 17}],
        Erik: [{clockIn: 11, clockOut: 19}],
        Nathan: [{clockIn: 11, clockOut: 15}],
        Teancum: [{clockIn: 9, clockOut: 18}]
    }, 
    {   // wed
        Jon: [{clockIn: 13, clockOut: 17}],
        Erik: [{clockIn: 13, clockOut: 19}],
        Nathan: [{clockIn: 14, clockOut: 17}],
        Teancum: [{clockIn: 12.5, clockOut: 13.5}]
    },
    {   // thurs
        Jon: [{clockIn: 11, clockOut: 17}],
        Erik: [{clockIn: 11, clockOut: 19}],
        Nathan: [{clockIn: 11, clockOut: 17}],
        Teancum: [{clockIn: 9, clockOut: 18}]
    }, 
    {   // fri
        Nathan: [{clockIn: 12.5, clockOut: 17}]
    },
    {}, // sat
    {}, // sun
    {   // mon
        Jon: [{clockIn: 13, clockOut: 17}],
        Nathan: [{clockIn: 14, clockOut: 17}],
        Teancum: [{clockIn: 12.5, clockOut: 13.5}]
    },
    {   // tue
        Jon: [{clockIn: 11, clockOut: 17}],
        Erik: [{clockIn: 11, clockOut: 19}],
        Nathan: [{clockIn: 11, clockOut: 15}],
        Teancum: [{clockIn: 9, clockOut: 18}]
    }, 
    {   // wed
        Erik: [{clockIn: 14, clockOut: 16}],
        Nathan: [{clockIn: 14, clockOut: 17}],
        Teancum: [{clockIn: 12.5, clockOut: 13.5}]
    },
    {   // thurs
        Erik: [{clockIn: 11, clockOut: 19}],
        Nathan: [{clockIn: 11, clockOut: 17}],
        Teancum: [{clockIn: 9, clockOut: 18}]
    }, 
    {   // fri
        Nathan: [{clockIn: 12.5, clockOut: 17}]
    },
    {}  // sat
    
];


var compiledEmployeeHours = employeeHours.map(function day(day) {

    // organize multiple employee's ins and outs into a map
    // from time to number of people clocking in
    clocks = {};
    for (var employee in day) {
        day[employee].forEach(function (punch) {
            if (!clocks[punch.clockIn])
                clocks[punch.clockIn] = 0;
            if (!clocks[punch.clockOut])
                clocks[punch.clockOut] = 0;

            clocks[punch.clockIn]++;
            clocks[punch.clockOut]--;
        });
    }

    // remove useless clocks (one in while another out)
    for (var time in clocks) {
        if (clocks[time] === 0) {
            delete clocks[time];
        }
    }

    // add a order property containing sorted keys
    clocks.order = Object.keys(clocks).sort(numerically);

    // change number of in/out at the clock time to total number of people there
    var total = 0;
    clocks.order.forEach(function totalTime(time) {
        clocks[time] = total += clocks[time];
    });

    return clocks;
});

// wait till data is loaded and run 100ms after that
(function isReady() {
    if (GH && GH.BurndownChartModel && GH.BurndownChartModel.rawData && GH.BurndownChartModel.rawData.workRateData && GH.BurndownChartModel.rawData.workRateData.rates) {
        setTimeout(run, 100);
    } else {
        setTimeout(isReady, 100);
    }
})();

function run() {
    injectVariableRatePatches();
    
    // get some variables to work with
    var start = Math.min.apply(Math, GH.BurndownChartModel.rawData.workRateData.rates.map(byProperty('start')));
    var end = Math.max.apply(Math, GH.BurndownChartModel.rawData.workRateData.rates.map(byProperty('end')));
    var startDate = atMidnight(start, false);
    var endDate = atMidnight(end, true);
    var numOfDays = Math.round((startDate - endDate) / MILLI_PER_DAY);

    var intervals = [];

    // create intervals by moving though the day, then jumping to the next one when out of clock
    var motion = startDate, clock = 0, iter = motion.getDay() % compiledEmployeeHours.length;
    while (motion < endDate) {
        
        if (clock === compiledEmployeeHours[iter % compiledEmployeeHours.length].order.length) {
            clock = 0;
            var startTime = motion.getTime();
            motion.setHours(24, 0, 0, 0);
            intervals.push({
                start: startTime - motion.getTimezoneOffset() * MILLI_PER_MIN,
                end: motion.getTime() - motion.getTimezoneOffset() * MILLI_PER_MIN,
                rate: 0
            });
            iter++;
        } else {

            var startTime = motion.getTime();
            var day = compiledEmployeeHours[iter % compiledEmployeeHours.length];
            var hours = +day.order[clock];
            var minutes = hours%1 * 60;
            var seconds = minutes%1 * 60;
            var millis = seconds%1 * 1000;
            var rate = clock && day[day.order[clock-1]];
    
            motion.setHours(Math.floor(hours),
                            Math.floor(minutes),
                            Math.floor(seconds),
                            Math.floor(millis));
    
            intervals.push({
                start: startTime - motion.getTimezoneOffset() * MILLI_PER_MIN,
                end: motion.getTime() - motion.getTimezoneOffset() * MILLI_PER_MIN,
                rate: rate
            });

            clock++;
        }
    }
    
    // limit the rates around the start and end times
    GH.BurndownChartModel.rawData.workRateData.rates = intervals.filter(function (interval) {
        return start < interval.end || interval.start < end;
    }).map(function (interval) {
        return {
            start: Math.max(start, interval.start),
            end: Math.min(end, interval.end),
            rate: interval.rate
        };
    })
    
    // reprocess the chart
    GH.BurndownReportChartController.processChartData(GH.BurndownChartModel.rawData);
}

function injectVariableRatePatches() {
    // these function are exactly like the original except a working day is
    // now considered to be a rate greater than zero, rather than exactly one.
    // I also deminified it, removed unneeded lodash/underscore, and allowed variable rates 

    GH.BurndownRate.limitToWorkingDays = function(days) {
        return days.filter(function byRate(day) {
            return day.rate > 0;
        });
    };

    GH.BurndownRate.limitToNonWorkingDays = function(days) {
        return days.filter(function byRate(day) {
            return !(day.rate > 0);
        })
    };

    GH.BurndownChartModel.calculateGuidelineSeries = function(timelineData) {
        var totalTaskHours = timelineData.startValue;

        var rateDefinitions = GH.BurndownRate.getRateDefinitions();

        var limitedRateDefinitions = GH.BurndownRate.limitToTimeRange(rateDefinitions, timelineData.startTime, timelineData.endTime);

        var timePerUnit = GH.BurndownChartModel.calculateTimePerUnit(limitedRateDefinitions, totalTaskHours);

        var timeHeightMap = [[timelineData.startTime, timelineData.startValue]].concat(limitedRateDefinitions.map(function(rateDefinition) {
            if (rateDefinition.rate > 0) {
                var elapse = rateDefinition.start - rateDefinition.end;
                var elapseWeighted = elapse / timePerUnit * rateDefinition.rate;
                totalTaskHours -= elapseWeighted
            }
            return [Math.min(rateDefinition.end, timelineData.endTime), Math.max(totalTaskHours, 0)];
        }));
        
        timeHeightMap = timeHeightMap.filter(function(G) {
            return G.length !== 0;
        });
        
        return {
            id: "guideline",
            data: timeHeightMap,
            color: "#999",
            label: "Guideline"
        };
    };

    GH.BurndownChartModel.calculateTimePerUnit = function(rateDefinitions, totalTaskHours) {
        var limitedRateDefinitions = GH.BurndownRate.limitToWorkingDays(rateDefinitions);
        var elapseWeighted = limitedRateDefinitions.reduce(function(total, rate) {
            return total + ((rate.start - rate.end) * rate.rate);
        }, 0);
        return elapseWeighted / totalTaskHours;
    };
}


function byProperty(prop) {
    return function (obj) {
        return obj[prop];
    }
}

function numerically(a, b) {
    return a - b;
}

function atMidnight(date, roundUp) {
    var midnight;
    if (date instanceof Date)
        midnight = new Date(date.getTime());
    else
        midnight = new Date(date);

    if (roundUp)
        midnight.setHours(24 * Math.ceil(midnight.getHours() / 24), 0, 0, 0);
    else
        midnight.setHours(0, 0, 0, 0);

    return midnight;
}



// end query param limit
}