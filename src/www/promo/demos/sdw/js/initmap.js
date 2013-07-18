// REVIEW: licensing implications with the use of google maps API? may or may not publish this in the end...

/**
 * Optional document entry point (by callback), when the page visited is initmap.html.
 */
if (-1 != window.location.pathname.indexOf('initmap.html'))
  $(document).ready(function() { new GetLatLngApp(); });

/**
 * GetLatLngApp.
 * Small helper to gather a bunch of real addresses and corresponding latitudes/longitudes.
 */
function GetLatLngApp()
{
  var lLocations = []; // The input can be a list of addresses (to be geocoded), or a list of approximate LatLng (to be reverse-geocoded).

  /*
  // Note: google imposes a daily quota on geocoding, and this blind approach doesn't seem to produce great results. 
  for (var x = 37.4098; x <= 38.5 && lLocations.length < 100; x += 0.005)
    for (var y = -122.155; y <= -122.055 && lLocations.length < 100; y+= 0.005)
      lLocations.push({location:new google.maps.LatLng(x, y)});
  */

  /*
  lLocations.push({address:'907 Cottrell Way, Stanford, California, United States'});
  lLocations.push({address:'963 Cottrell Way, Stanford, California, United States'});
  lLocations.push({address:'875 Lathrop Drive, Stanford, California, United States'});
  lLocations.push({address:'877 Lathrop Drive, Stanford, California, United States'});
  lLocations.push({address:'879 Lathrop Drive, Stanford, California, United States'});
  lLocations.push({address:'881 Lathrop Drive, Stanford, California, United States'});
  lLocations.push({address:'842 Mayfield Avenue, Stanford, California, United States'});
  lLocations.push({address:'886 Mayfield Avenue, Stanford, California, United States'});
  lLocations.push({address:'888 Mayfield Avenue, Stanford, California, United States'});
  lLocations.push({address:'890 Mayfield Avenue, Stanford, California, United States'});
  lLocations.push({address:'894 Mayfield Avenue, Stanford, California, United States'});
  lLocations.push({address:'1014 Vernier Place, Stanford, California, United States'});
  lLocations.push({address:'1024 Vernier Place, Stanford, California, United States'});
  // ---
  lLocations.push({address:'903 Ilima Way, Palo Alto, California, United States'});
  lLocations.push({address:'905 Ilima Way, Palo Alto, California, United States'});
  lLocations.push({address:'919 Ilima Way, Palo Alto, California, United States'});
  lLocations.push({address:'927 Ilima Way, Palo Alto, California, United States'});
  lLocations.push({address:'933 Ilima Way, Palo Alto, California, United States'});
  lLocations.push({address:'3793 Laguna Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'3879 Laguna Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'3908 Laguna Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'883 La Para Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'887 La Para Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'889 La Para Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'891 La Para Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'913 Paradise Way, Palo Alto, California, United States'});
  lLocations.push({address:'921 Paradise Way, Palo Alto, California, United States'});
  lLocations.push({address:'929 Paradise Way, Palo Alto, California, United States'});
  lLocations.push({address:'935 Paradise Way, Palo Alto, California, United States'});
  lLocations.push({address:'870 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'872 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'876 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'880 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'882 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'884 San Jude Avenue, Palo Alto, California, United States'});
  lLocations.push({address:'858 Timlott Lane, Palo Alto, California, United States'});
  lLocations.push({address:'872 Timlott Lane, Palo Alto, California, United States'});
  lLocations.push({address:'882 Timlott Lane, Palo Alto, California, United States'});
  // ===
  lLocations.push({address:'3722 Center Avenue, Richmond, California, United States'});
  lLocations.push({address:'3726 Center Avenue, Richmond, California, United States'});
  lLocations.push({address:'3728 Center Avenue, Richmond, California, United States'});
  lLocations.push({address:'3734 Center Avenue, Richmond, California, United States'});
  lLocations.push({address:'3737 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3795 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3807 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3811 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3817 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3833 Florida Avenue, Richmond, California, United States'});
  lLocations.push({address:'3727 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3733 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3753 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3795 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3807 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3817 Ohio Avenue, Richmond, California, United States'});
  lLocations.push({address:'3728 Waller Avenue, Richmond, California, United States'});
  lLocations.push({address:'3734 Waller Avenue, Richmond, California, United States'});
  lLocations.push({address:'3764 Waller Avenue, Richmond, California, United States'});
  lLocations.push({address:'3798 Waller Avenue, Richmond, California, United States'});
  */

  console.log("geocoding...");
  var lResults = $("#results");
  var lGeocoder = new google.maps.Geocoder();
  for (var iL = 0; iL < lLocations.length; iL++)
  {
    // setTimeout(function(_pIL) { return function() {
      lGeocoder.geocode(
        lLocations[/*_pIL*/iL],
        function(results, status)
        {
          if (status != google.maps.GeocoderStatus.OK)
            { console.log("error during geocode: " + status); return; }
          lResults.append($("<p>{address:'" + results[0].formatted_address + "', latlng:[" + results[0].geometry.location.lat() + "," + results[0].geometry.location.lng() + "]}</p>"));
        });
    // }}(iL), 500);
  }
}
