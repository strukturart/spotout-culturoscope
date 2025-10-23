"use strict";

import localforage from "localforage";

import m from "mithril";
import L from "leaflet";
import dayjs from "dayjs";

import "swiped-events";
import markerIcon from "./assets/css/images/marker-icon.png";
import markerIconRetina from "./assets/css/images/marker-icon-2x.png";
import "font-awesome/css/font-awesome.min.css";

import duration from "dayjs/plugin/duration";

dayjs.extend(duration);

let share_url = async (data) => {
  try {
    await navigator.share(data);
    resultPara.textContent = "shared successfully";
  } catch (err) {
    resultPara.textContent = `Error: ${err}`;
  }
};

const intro = document.getElementById("intro");

setTimeout(() => {
  intro.style.display = "none";
}, 5000);

document.addEventListener("DOMContentLoaded", function (e) {
  let updateTime = 3 * 60 * 60 * 1000;
  //updateTime = 10;

  let categories = ["All"];

  let todosList = [];
  let fetchError = "";

  //get station around position
  let getStation = async (lat, lng) => {
    try {
      const response = await fetch(
        "https://ors.strukturart.workers.dev?start=" + lat + "&end=" + lng
      );

      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch-Fehler:", error);
      return null;
    }
  };

  let retryToload = false;
  let getJourney = async (from, to) => {
    try {
      const response = await fetch(
        `https://transport.opendata.ch/v1/connections?from=${from}&to=${to}&transportations=bus`
      );

      if (!response.ok) throw new Error("Network response was not ok");

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Fetch-Fehler:", error);
      if (retryToload == false) {
        let memory = updateTime;
        updateTime = 0;
        loadTodosAndCache();
        retryToload = true;
        updateTime = memory;
      }
      return null;
    }
  };

  //get location from url
  function getReferencePointFromURL(start = false) {
    //test if location has changed
    let lastPosition = localStorage.getItem("lat");

    //default location
    let lat = 47.132344;
    let lng = 7.244604;

    const hash = window.location.hash;
    const queryStart = hash.indexOf("?");
    if (queryStart !== -1) {
      const query = hash.substring(queryStart);
      const params = new URLSearchParams(query);
      lat = parseFloat(params.get("lat")) || lat;
      lng = parseFloat(params.get("lng")) || lng;

      if (lastPosition != lat) {
        updateTime = 0;
        console.log("location has changed");
      }
    }

    if (start) {
      //get closest station to current position
      getStation(lat, lng).then((e) => {
        let station = e.stations.find((m) => {
          return m.id != null && m.icon == "bus";
        });

        localStorage.setItem("location_id", station?.id);
        localStorage.setItem("location_name", station?.name);
      });

      localStorage.setItem("lat", lat);
      localStorage.setItem("lng", lng);
    }

    return L.latLng(lat, lng);
  }

  const referencePoint = getReferencePointFromURL(true);

  // Hauptfunktion zum Starten
  async function loadTodosAndCache() {
    try {
      const lastUpdated = await localforage.getItem("data_updated");
      const now = Date.now();

      if (lastUpdated) {
        const age = now - new Date(lastUpdated).getTime();
        if (age < updateTime) {
          const cachedData = await localforage.getItem("data");
          const cachedCategories = await localforage.getItem("categories");

          if (cachedData && cachedCategories) {
            todosList = cachedData;
            categories = cachedCategories;
            return;
          }
        }
      }

      // Daten von API laden
      const response = await m.request({
        method: "GET",
        url: "https://culturoscope-add-location.strukturart.workers.dev/",
      });

      todosList = response.events.filter((e) => e.address_latlng != null);

      todosList.forEach((e) => {
        const latlng = L.latLng(e.address_latlng.lat, e.address_latlng.lng);
        const d = latlng.distanceTo(referencePoint);
        e.distance = d;
        e.prettyDistance =
          d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m";
        e.busStop = "";

        //Categorie
        e.event_categories_labels.forEach((label) => {
          const trimmed = label.trim();
          if (!categories.includes(trimmed)) {
            categories.push(trimmed);
          }
        });

        //get duration by event address
        let address = e.venue_zip + " " + e.venue_city + ", " + e.venue_address;
        getJourney(localStorage.getItem("location_id"), address).then((way) => {
          e.duration = null;
          if (way?.connections?.length) {
            let d = way.connections[0].duration;
            e.duration = d.replace(/\d{2}d/, "");

            const input = e.duration;
            const [hours, minutes, seconds] = input.split(":").map(Number);

            const dur = dayjs.duration({ hours, minutes, seconds });
            e.prettyDuration = dur.asMinutes();
            e.transport = way;
          }
        });

        getStation(e.address_latlng.lat, e.address_latlng.lng).then((data) => {
          let busStop = null;
          if (data?.stations?.length) {
            const buses = data.stations.filter((s) => s.icon === "bus");
            if (buses[0]?.name) busStop = buses[0].name;
          }

          let remove_city_string = busStop.split(",");
          busStop = remove_city_string[1];

          const original = todosList.find((a) => a.event_id === e.event_id);
          if (original) original.busStop = busStop;

          e.busStop = busStop;
        });
      });

      // Nach Distanz sortieren
      todosList.sort((a, b) => a.distance - b.distance);

      // Cache speichern
      await localforage.setItem("data", todosList);
      await localforage.setItem("categories", categories);
      await localforage.setItem("data_updated", new Date());
    } catch (e) {
      fetchError = e.message;
    }
  }

  loadTodosAndCache().then(() => {
    m.redraw();
  });

  //ugly hack
  setTimeout(() => {
    localforage.setItem("data", todosList);
  }, 5000);

  let filter = "";

  var events = {
    oninit: () => {},

    view: function () {
      return m("div", [
        m(Modal),

        m(
          "button",
          {
            id: "filter-reset",
            onclick: (vnode) => {
              document.querySelector("#filter-reset").style.display = "none";

              document.querySelector("#filter-list").style.position =
                "relative";
              document.querySelector("#filter-list").style.height = "auto";
            },

            oncreate: () => {
              //intro animation
              if (sessionStorage.getItem("visited") == "1") {
                intro.style.display = "none";
              } else {
                setTimeout(() => {
                  intro?.classList.add("hide");
                }, 1000);
              }
            },
          },
          "Filter"
        ),

        m(
          "div",
          {
            oncreate: (vnode) => {
              vnode.dom.style.display = "none";
            },
          },
          localStorage.getItem("location_name")
        ),

        m(
          "div",
          { id: "filter-list", class: "row" },
          categories.map(function (item) {
            return m(
              "button",
              {
                class: "filter-list-button",
                onclick: (e) => {
                  filter = item;
                  m.redraw();

                  document.querySelector("#filter-reset").style.display =
                    "block";

                  document.querySelector("#filter-list").style.position =
                    "fixed";
                  document.querySelector("#filter-list").style.height = "0px";
                },
              },
              item
            );
          })
        ),

        m(
          "div",
          { class: "row between-md" },
          todosList.map(function (item) {
            if (
              filter != "All" &&
              filter != "" &&
              !item.event_categories_labels.includes(filter)
            )
              return;

            return m("article", { class: "debug col-xs-12 col-md-4" }, [
              m("h2", item.venue_name),
              m("div", item.event_title),
              m(
                "div",
                dayjs(item.event_dates[0].start_date).format("DD.MM.YY HH:mm")
              ),
              m("div", item.prettyDistance),
              item.duration
                ? m(
                    "div",
                    {
                      oncreate: (vnode) => {
                        vnode.dom.innerText = item.prettyDuration + "min";
                      },
                    },
                    item.duration
                  )
                : null,

              m("img", { src: item.image_url, loading: "lazy" }),
              m("div", { class: "action-buttons row" }, [
                m(
                  "a",
                  {
                    href:
                      "#!/map?lat=" +
                      item.address_latlng.lat +
                      "&lng=" +
                      item.address_latlng.lng,
                  },
                  [
                    m("i", {
                      class: "col-xs-2 fa fa-map fa-2x",
                      "aria-hidden": "true",
                    }),
                  ]
                ),
                m(
                  "a",
                  {
                    href: "#modal",
                    onclick: (e) => {
                      e.preventDefault();
                      Modal.toggle(true, {
                        title: "🚌 Bus",
                        message:
                          "you will find a bus stop near you that will take you to the event in <strong>" +
                          item.prettyDuration +
                          " minutes</strong>.",
                      });
                    },
                  },
                  [
                    m("i", {
                      class: "col-xs-2 fa fa-bus fa-2x",
                    }),
                  ]
                ),
                m("a", { href: item.culturoscope_url, target: "_blank" }, [
                  m("i", {
                    class: "col-xs-2 fa fa-external-link fa-2x",
                    "aria-hidden": "true",
                  }),
                ]),
                m(
                  "a",
                  {
                    oncreate: (vnode) => {
                      if (!navigator.share) {
                        vnode.dom.style.display = "none";
                      }
                    },
                    onclick: () => {
                      share_url({
                        title: "Culturoscope",
                        text: "Culturoscope",
                        url: item.culturoscope_url,
                      });
                    },
                  },
                  [
                    m("i", {
                      class: "col-xs-2 fa fa-share-square fa-2x",
                      "aria-hidden": "true",
                    }),
                  ]
                ),
              ]),
            ]);
          })
        ),
      ]);
    },
  };

  const Modal = {
    visible: false,
    data: {},

    toggle(state, data = {}) {
      Modal.visible = state;
      Modal.data = data;
    },

    // Modal.js
    view(vnode) {
      if (!Modal.visible) return null;
      const { title, message } = Modal.data;

      return m(
        "dialog[open]",
        {
          onclick: (e) => {
            if (e.target.tagName === "DIALOG") Modal.toggle(false);
          },
        },
        m("article", [
          m("header", [
            m("button", {
              onclick: () => {
                Modal.toggle(false);
              },
              "aria-label": "Close",
              "rel": "prev",
            }),
            m("p", m("strong", title)),
          ]),
          m("p", [m.trust(message)]),
        ])
      );
    },
  };

  let map_container;
  var map = {
    onremove: () => {
      map_container = null;
    },
    view: () => {
      return m("div", {
        id: "map-container",
        class: "",
        oncreate: () => {
          let lat = localStorage.getItem("lat");
          let lng = localStorage.getItem("lng");

          map_container = L.map("map-container", {
            keyboard: true,
            zoomControl: false,
          }).setView([lat, lng], 16);

          L.Icon.Default.prototype.options.shadowUrl = "";
          L.Icon.Default.prototype.options.iconUrl = markerIcon;
          L.Icon.Default.prototype.options.iconRetinaUrl = markerIconRetina;

          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map_container);

          //users location
          //without geolocatioon api
          //qr-scan->url
          let myMarker = L.marker([lat, lng]);
          myMarker.addTo(map_container).bindTooltip("You");
          myMarker.openTooltip();

          //get events location and create markers
          todosList.map((e) => {
            let marker = L.marker([
              e.address_latlng.lat,
              e.address_latlng.lng,
            ]).addTo(map_container);
            marker.bindTooltip(e.venue_name);

            const center = map_container.getCenter();
            const markerLatLng = marker.getLatLng();

            if (
              center.lat === markerLatLng.lat &&
              center.lng === markerLatLng.lng
            ) {
              marker.openTooltip();
            }
          });
        },
      });
    },
  };
  var about = {
    view: () => {
      return m("div", { class: "row center-xs", id: "about" }, [
        m("div", { class: "col-xs-12 col-md-7 text" }, [
          m.trust(
            "Diese Website zeigt dir, welche Veranstaltungen in der Nähe eines der 'Kultursäulen' der Stadt Biel/Bienne stattfinden.Sie wurde im Rahmen des Projekts <a href='https://spotin.ch' target:'_blank'>Spotin</a> erstellt, das von der Stadt Biel/Bienne initiiert wurde.Die Veranstaltungsdaten werden von <a target:'_blank' href='https://www.culturoscope.ch/agenda'>Culturocope</a> zur Verfügung gestellt."
          ),

          m.trust(
            "<br><br>Ce site vous permet de découvrir les événements qui ont lieu à proximité de l’un des piliers culturels de la ville de Bienne. Il a été réalisé dans le cadre du projet <a href='https://spotin.ch' target:'_blank'>Spotin</a>, une initiative de la Ville de Bienne.Les données des événements sont fournies par <a target:'_blank' href='https://www.culturoscope.ch/agenda'>Culturocope</a>"
          ),
          m.trust("<br><br><strong>Links</strong><br>"),
          m("ul", [
            m("li", [m("a", { href: "https://spotin.ch" }, "spotin.ch")]),
            m("li", [
              m(
                "a",
                { href: "https://www.culturoscope.ch/agenda" },
                "culturoscope.ch/agenda"
              ),
            ]),
            m("li", [
              m(
                "a",
                {
                  href: "https://www.velokurierbiel.ch/de/service-plus/plakatservice",
                },
                "Kultursäulen"
              ),
            ]),
          ]),
        ]),
      ]);
    },
  };

  let root = document.getElementById("app");

  m.route(root, "/events", {
    "/events": events,
    "/map": map,
    "/about": about,
  });
});
