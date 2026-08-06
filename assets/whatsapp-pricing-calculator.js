(function () {
  "use strict";
  var form = document.getElementById("wpPlanEstimator");
  var output = document.getElementById("wpEstimatorResult");
  if (!form || !output) return;
  function recommend() {
    var data = new FormData(form);
    var users = Number(data.get("users"));
    var numbers = Number(data.get("numbers"));
    var volume = Number(data.get("volume"));
    var score = users >= 40 ? 3 : users >= 15 ? 2 : 0;
    score += numbers >= 5 ? 2 : numbers >= 2 ? 1 : 0;
    score += volume >= 250000 ? 3 : volume >= 50000 ? 2 : 0;
    score += data.get("automation") === "advanced" ? 3 : data.get("automation") === "standard" ? 1 : 0;
    score += data.get("integrations") === "multiple" ? 3 : data.get("integrations") === "one" ? 1 : 0;
    if (data.get("governance")) score += 2;
    var plan = score <= 4 ? "Launch" : score <= 10 ? "Growth" : "Enterprise";
    var reason = plan === "Launch" ? "A focused team can begin with core inbox, templates and reporting." : plan === "Growth" ? "Your scale points to campaigns, automation, routing and richer insights." : "Your operation needs custom integration, governance and implementation planning.";
    output.innerHTML = "<strong>Planning recommendation</strong><h3>" + plan + "</h3><p>" + reason + " This is planning guidance, not a commercial quote.</p>";
  }
  form.addEventListener("submit", function (event) { event.preventDefault(); recommend(); });
  form.addEventListener("reset", function () { window.setTimeout(recommend, 0); });
  recommend();
})();
