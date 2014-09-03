// ==UserScript==
// @name       JIRA work time
// @namespace  https://github.com/JonathanGawrych/jira-non-working-hours
// @version    0.1.0
// @description  Mark Non-Working Hours as such in jira's burndown chart
// @match      https://jira.mtc.byu.edu/jira/secure/RapidBoard.jspa*
// @copyright  2014+, Jonathan Gawrych
// ==/UserScript==


if (/\bchart=burndownChart\b/.test(location.search)) {
    function isReady() {
        if (GH && GH.BurndownChartModel && GH.BurndownChartModel.rawData && GH.BurndownChartModel.rawData.workRateData && GH.BurndownChartModel.rawData.workRateData.rates) {
            run();
        } else {
            setTimeout(isReady, 100);
        }
    }
    
    setTimeout(isReady, 100);
    function run() {
        console.log("go!");
        var MILLI_PER_HOUR = 1000 * 60 * 60;
        var WORK_DAY_START = 8;
        var WORK_DAY_END = (12 + 6);
        
        var splitPoints = [WORK_DAY_START, WORK_DAY_END];
        
        function timeMid(date, forward) {
            var midnight = new Date(date.getTime());
            midnight.setMilliseconds(0);
            midnight.setSeconds(0);
            midnight.setMinutes(0);
            midnight.setHours(forward ? 24 : 0);
            return midnight;
        }
        
        function calcRate(date) {
            return (splitPoints[0] <= date.getHours() && date.getHours() < splitPoints[1]) ? 1 : 0;
        }
        
        GH.BurndownChartModel.rawData.workRateData.rates=
        GH.BurndownChartModel.rawData.workRateData.rates.reduce(function nonWorkingHours(soFar, next) {
            return soFar.concat((function splitItem(toSplit) {
                // if we are not working, no need to split up the time
                if (toSplit.rate === 0) {
                    return [toSplit];
                }
        
                var split = [];
                var startTime = new Date(toSplit.start + (6 * MILLI_PER_HOUR));
                var endTime = new Date(toSplit.end + (6 * MILLI_PER_HOUR));
                var startDay = timeMid(startTime, false);
                var endDay = timeMid(endTime, true);
        
                var iterator = new Date(startDay.getTime());
        
                var last = new Date(startDay.getTime());
                for (var iterator = new Date(startDay.getTime()); iterator < endDay; iterator.setHours(24)) {
                    for (var j = 0; j < splitPoints.length; j++) {
                        var end = new Date(iterator.getTime());
                        end.setHours(splitPoints[j]);
                        split.push({
                            start: last - (6 * MILLI_PER_HOUR),
                            end: end - (6 * MILLI_PER_HOUR),
                            rate: calcRate(last)
                        });
                        last = end;
                    }
                }
        
                for (var k = 0; k < split.length-1; k++) {
                    if (split[k+1].start >= toSplit.start) {
                        split[k].start = toSplit.start;
                        split[k].rate = calcRate(new Date(split[k].start + (6 * MILLI_PER_HOUR)));
                        break;
                    } else {
                        split.splice(0, 1);
                        k--;
                    }
                }
        
                for (var l = split.length-1; l > 0 ; l--) {
                    if (split[l-1].end <= toSplit.end) {
                        split[l].end = toSplit.end;
                        break;
                    } else {
                        split.splice(l, 1);
                    }
                }
        
                return split;
        
            })(next));
        }, []);
        
        
        
        GH.BurndownReportChartController.processChartData(GH.BurndownChartModel.rawData);
    }
}