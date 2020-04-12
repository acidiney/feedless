const pull = require("pull-stream");
const cat = require("pull-cat");
const debugPosts = require("debug")("queries:posts"),
  debugMessages = require("debug")("queries:messages"),
  debugFriends = require("debug")("queries:friends"),
  debugFriendshipStatus = require("debug")("queries:friendship_status"),
  debugPeople = require("debug")("queries:people"),
  debugProfile = require("debug")("queries:profile");
const paramap = require("pull-paramap");
const { promisePull, mapValues } = require("./utils");

const latestOwnerValue = (ssbServer, { key, dest }) => {
  return promisePull(
    ssbServer.query.read({
      reverse: true,
      query: [
        {
          $filter: {
            value: {
              author: dest,
              content: { type: "about", about: dest },
            },
          },
        },
      ],
    }),
    pull.filter((msg) => {
      return (
        msg.value.content &&
        key in msg.value.content &&
        !(msg.value.content[key] && msg.value.content[key].remove)
      );
    }),
    pull.take(1)
  ).then(([entry]) => {
    if (entry) {
      return entry.value.content[key];
    }
    return ssbServer.about.latestValue({ key, dest });
  });
};

const mapProfiles = (ssbServer) => (data, callback) =>
  getProfile(ssbServer, data.value.author)
    .then((author) => {
      data.value.authorProfile = author;
      callback(null, data);
    })
    .catch((err) => callback(err, null));

const getPosts = async (ssbServer, profile) => {
  debugPosts("Fetching");

  const posts = await promisePull(
    // @ts-ignore
    cat([
      ssbServer.query.read({
        reverse: true,
        query: [
          {
            $filter: {
              value: {
                private: { $not: true },
                content: {
                  root: profile.id,
                },
              },
            },
          },
        ],
        limit: 100,
      }),
      ssbServer.query.read({
        reverse: true,
        query: [
          {
            $filter: {
              value: {
                author: profile.id,
                private: { $not: true },
                content: {
                  type: "post",
                  root: { $not: true },
                },
              },
            },
          },
        ],
        limit: 100,
      }),
    ]),
    pull.filter((msg) => msg.value.content.type == "post"),
    paramap(mapProfiles(ssbServer))
  );

  debugPosts("Done");

  return mapValues(posts);
};

const getVanishingMessages = async (ssbServer, profile) => {
  debugMessages("Fetching");
  const messagesPromise = promisePull(
    // @ts-ignore
    cat([
      ssbServer.query.read({
        reverse: true,
        query: [
          {
            $filter: {
              value: {
                private: true,
                content: {
                  root: profile.id,
                },
              },
            },
          },
        ],
        limit: 100,
      }),
      ssbServer.query.read({
        reverse: true,
        query: [
          {
            $filter: {
              value: {
                private: true,
                content: {
                  type: "post",
                  root: { $not: true },
                },
              },
            },
          },
        ],
        limit: 100,
      }),
    ]),
    pull.filter(
      (msg) =>
        msg.value.content.type == "post" &&
        (msg.value.content.root || msg.value.content.recps.includes(profile.id))
    ),
    paramap(mapProfiles(ssbServer))
  );

  const deletedPromise = promisePull(
    ssbServer.query.read({
      reverse: true,
      query: [
        {
          $filter: {
            value: {
              author: profile.id,
              content: {
                type: "delete",
              },
            },
          },
        },
      ],
    })
  ).then(Object.values);

  const [messages, deleted] = await Promise.all([
    messagesPromise,
    deletedPromise,
  ]);
  const deletedIds = deleted.map((x) => x.value.content.dest);
  debugMessages("Done");
  return messages.filter((m) => !deletedIds.includes(m.key));
};

const searchPeople = async (ssbServer, search) => {
  debugPeople("Fetching");

  const people = await promisePull(
    ssbServer.query.read({
      reverse: true,
      query: [
        {
          $filter: {
            value: {
              content: {
                type: "about",
                name: { $is: "string" },
              },
            },
          },
        },
      ],
    }),
    pull.filter((msg) => {
      return (
        msg.value.content &&
        msg.value.author == msg.value.content.about &&
        msg.value.content.name.includes(search)
      );
    })
  );

  debugPeople("Done");
  return Object.values(mapValues(people));
};

const getFriends = async (ssbServer, profile) => {
  debugFriends("Fetching");

  let graph = await ssbServer.friends.getGraph();

  let connections = {};
  for (let key in graph) {
    let isFollowing = graph[profile.id][key] > 0;
    let isFollowingBack = graph[key] && graph[key][profile.id] > 0;
    if (isFollowing && isFollowingBack) {
      connections[key] = "friends";
    } else if (isFollowing && !isFollowingBack) {
      connections[key] = "requestsSent";
    } else if (!isFollowing && isFollowingBack) {
      if (graph[profile.id][key] === undefined)
        connections[key] = "requestsReceived";
    }
  }

  const profilesList = await Promise.all(
    Object.keys(connections).map((id) => getProfile(ssbServer, id))
  );
  const profilesHash = profilesList.reduce((hash, profile) => {
    hash[profile.id] = profile;
    return hash;
  }, {});

  let result = {
    friends: [],
    requestsSent: [],
    requestsReceived: [],
  };
  for (let key in connections) {
    result[connections[key]].push(profilesHash[key]);
  }

  debugFriends("Done");
  return result;
};

const getFriendshipStatus = async (ssbServer, source, dest) => {
  debugFriendshipStatus("Fetching");

  let requestRejectionsPromise = promisePull(
    ssbServer.query.read({
      reverse: true,
      query: [
        {
          $filter: {
            value: {
              author: source,
              content: {
                type: "contact",
                following: false,
              },
            },
          },
        },
      ],
      limit: 100,
    })
  ).then(mapValues);

  const [isFollowing, isFollowingBack, requestRejections] = await Promise.all([
    ssbServer.friends.isFollowing({ source: source, dest: dest }),
    ssbServer.friends.isFollowing({ source: dest, dest: source }),
    requestRejectionsPromise.then((x) => x.map((y) => y.content.contact)),
  ]);

  let status = "no_relation";
  if (isFollowing && isFollowingBack) {
    status = "friends";
  } else if (isFollowing && !isFollowingBack) {
    status = "request_sent";
  } else if (!isFollowing && isFollowingBack) {
    if (requestRejections.includes(dest)) {
      status = "request_rejected";
    } else {
      status = "request_received";
    }
  }
  debugFriendshipStatus("Done");

  return status;
};

const getAllEntries = (ssbServer, query) => {
  let queries = [];
  if (query.author) {
    queries.push({ $filter: { value: { author: query.author } } });
  }
  if (query.type) {
    queries.push({ $filter: { value: { content: { type: query.type } } } });
  }
  const queryOpts = queries.length > 0 ? { query: queries } : {};

  return promisePull(
    ssbServer.query.read({
      reverse: true,
      limit: 500,
      ...queryOpts,
    })
  );
};

let profileCache = {};
const getProfile = async (ssbServer, id) => {
  if (profileCache[id]) return profileCache[id];

  let getKey = (key) => latestOwnerValue(ssbServer, { key, dest: id });

  let [name, image, description] = await Promise.all([
    getKey("name"),
    getKey("image"),
    getKey("description"),
  ]).catch((err) => {
    console.error("Could not retrieve profile for", id, err);
  });

  let profile = { id, name, image, description };
  profileCache[id] = profile;

  return profile;
};

setInterval(() => {
  debugProfile("Clearing profile cache");
  profileCache = {};
}, 5 * 60 * 1000);

module.exports = {
  mapProfiles,
  getPosts,
  searchPeople,
  getFriends,
  getAllEntries,
  getProfile,
  getVanishingMessages,
  profileCache,
  getFriendshipStatus,
};
