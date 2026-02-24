const fs = require("fs");
const path = require("path");
const activityService = require("./activity.service");

const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const lowered = String(value).toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  return undefined;
};

const parseMaybeInt = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return undefined;
  return Math.trunc(parsed);
};

const unlinkIfExists = (filePath) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const imagePathToAbsolute = (imagePath) => {
  if (!imagePath) return null;
  const safeRelative = imagePath.replace(/^\/+/, "");
  return path.join(process.cwd(), safeRelative);
};

const toPublicActivityDTO = (activity) => ({
  id: String(activity._id),
  title: activity.title,
  description: activity.description,
  dateIso: new Date(activity.eventDate).toISOString(),
  durationDays: Number(activity.durationDays) || 1,
  location: activity.location,
  imageUrl: activity.imageUrl,
  tag: activity.tag,
});

const toManagementActivityDTO = (activity) => ({
  ...toPublicActivityDTO(activity),
  isPublished: activity.isPublished,
  createdAt: activity.createdAt,
  updatedAt: activity.updatedAt,
});

class ActivityController {
  async listPublicUpcoming(req, res, next) {
    try {
      const limit = Number(req.query.limit) || 8;
      const activities = await activityService.listPublicUpcoming(limit);
      res.json(activities.map(toPublicActivityDTO));
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const result = await activityService.listForManagement(req.query);
      res.json({
        ...result,
        data: result.data.map(toManagementActivityDTO),
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const activity = await activityService.getById(req.params.id);
      if (!activity) return res.status(404).json({ message: "Activite introuvable" });
      res.json(toManagementActivityDTO(activity));
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Image activite obligatoire (upload fichier)" });
      }

      const payload = {
        title: req.body.title,
        description: req.body.description,
        eventDate: req.body.dateIso,
        durationDays: parseMaybeInt(req.body.durationDays),
        location: req.body.location,
        imageUrl: `/uploads/activities/${req.file.filename}`,
        tag: req.body.tag,
      };

      const parsedIsPublished = parseBoolean(req.body.isPublished);
      if (parsedIsPublished !== undefined) payload.isPublished = parsedIsPublished;

      const activity = await activityService.create(payload);
      res.status(201).json(toManagementActivityDTO(activity));
    } catch (error) {
      if (req.file) unlinkIfExists(req.file.path);
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const payload = {};
      if (req.body.title !== undefined) payload.title = req.body.title;
      if (req.body.description !== undefined) payload.description = req.body.description;
      if (req.body.dateIso !== undefined) payload.eventDate = req.body.dateIso;
      if (req.body.durationDays !== undefined) {
        payload.durationDays = parseMaybeInt(req.body.durationDays);
      }
      if (req.body.location !== undefined) payload.location = req.body.location;
      if (req.body.tag !== undefined) payload.tag = req.body.tag;

      const parsedIsPublished = parseBoolean(req.body.isPublished);
      if (parsedIsPublished !== undefined) payload.isPublished = parsedIsPublished;

      const activity = await activityService.update(req.params.id, payload);
      if (!activity) return res.status(404).json({ message: "Activite introuvable" });
      res.json(toManagementActivityDTO(activity));
    } catch (error) {
      next(error);
    }
  }

  async replacePhoto(req, res, next) {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Image activite obligatoire (upload fichier)" });
      }

      const existing = await activityService.getById(req.params.id);
      if (!existing) {
        unlinkIfExists(req.file.path);
        return res.status(404).json({ message: "Activite introuvable" });
      }

      const oldImageUrl = existing.imageUrl;
      const newImageUrl = `/uploads/activities/${req.file.filename}`;

      const updated = await activityService.update(req.params.id, { imageUrl: newImageUrl });
      if (!updated) {
        unlinkIfExists(req.file.path);
        return res.status(404).json({ message: "Activite introuvable" });
      }

      if (oldImageUrl && oldImageUrl.startsWith("/uploads/activities/")) {
        unlinkIfExists(imagePathToAbsolute(oldImageUrl));
      }

      res.json(toManagementActivityDTO(updated));
    } catch (error) {
      if (req.file) unlinkIfExists(req.file.path);
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const activity = await activityService.delete(req.params.id);
      if (!activity) return res.status(404).json({ message: "Activite introuvable" });

      if (activity.imageUrl && activity.imageUrl.startsWith("/uploads/activities/")) {
        unlinkIfExists(imagePathToAbsolute(activity.imageUrl));
      }

      res.json({ message: "Activite supprimee" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ActivityController();
