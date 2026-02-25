const Activity = require("./activity.model");

const DEFAULT_ACTIVITIES = [
  {
    sourceKey: "event-1",
    title: "TI Live Shopping Night",
    description:
      "Une soiree immersive avec offres flash, showcases boutiques et experiences premium jusqu a 22h.",
    eventDate: new Date("2027-03-14T18:00:00+03:00"),
    durationDays: 1,
    location: "Atrium Central - TI Commercial",
    imageUrl:
      "https://images.pexels.com/photos/374894/pexels-photo-374894.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tag: "Shopping Event",
    isPublished: true,
  },
  {
    sourceKey: "event-2",
    title: "Festival Street Food & Music",
    description:
      "Degustations exclusives, corners chefs invites et ambiance live pour toute la famille.",
    eventDate: new Date("2027-03-22T11:00:00+03:00"),
    durationDays: 2,
    location: "Esplanade Nord - TI Commercial",
    imageUrl:
      "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tag: "Food & Music",
    isPublished: true,
  },
  {
    sourceKey: "event-3",
    title: "Innovation Market Weekend",
    description:
      "Decouvrez les marques emergentes, demos interactives et animations tech pour petits et grands.",
    eventDate: new Date("2027-04-05T10:00:00+03:00"),
    durationDays: 2,
    location: "Hall Est - TI Commercial",
    imageUrl:
      "https://images.pexels.com/photos/587741/pexels-photo-587741.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tag: "Innovation",
    isPublished: true,
  },
];

class ActivityService {
  async ensureDefaultSeed() {
    const total = await Activity.countDocuments({});
    if (total > 0) return;
    await Activity.insertMany(DEFAULT_ACTIVITIES);
  }

  async listPublicUpcoming(page = 1, limit = 10) {
    await this.ensureDefaultSeed();
    const now = new Date();
    const skip = (page - 1) * limit;
    const query = {
      isPublished: true,
      eventDate: { $gte: now },
    };

    const [data, total] = await Promise.all([
      Activity.find(query).sort({ eventDate: 1 }).skip(skip).limit(limit),
      Activity.countDocuments(query),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async listForManagement(queryParams) {
    await this.ensureDefaultSeed();

    const page = Math.max(1, Number(queryParams.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(queryParams.limit) || 10));
    const skip = (page - 1) * limit;

    const query = {};

    if (queryParams.published !== undefined) {
      query.isPublished = String(queryParams.published).toLowerCase() === "true";
    }

    if (String(queryParams.upcoming).toLowerCase() === "true") {
      query.eventDate = { $gte: new Date() };
    }

    if (queryParams.search) {
      query.$or = [
        { title: { $regex: queryParams.search, $options: "i" } },
        { description: { $regex: queryParams.search, $options: "i" } },
        { tag: { $regex: queryParams.search, $options: "i" } },
        { location: { $regex: queryParams.search, $options: "i" } },
      ];
    }

    const [data, total] = await Promise.all([
      Activity.find(query).sort({ eventDate: 1 }).skip(skip).limit(limit),
      Activity.countDocuments(query),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id) {
    await this.ensureDefaultSeed();
    return Activity.findById(id);
  }

  async create(payload) {
    return Activity.create(payload);
  }

  async update(id, payload) {
    return Activity.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });
  }

  async delete(id) {
    return Activity.findByIdAndDelete(id);
  }
}

module.exports = new ActivityService();
