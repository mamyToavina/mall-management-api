// pagination.js

const paginate = async (model, query, page = 1, limit = 10) => {
  const skip = (page - 1) * limit

  const [data, total] = await Promise.all([
    model
      .find(query)
      .skip(skip)
      .limit(Number(limit))
      .sort({ createdAt: -1 })
      .select('-password'),
    model.countDocuments(query)
  ])

  return {
    data,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit)
    }
  }
}

module.exports = paginate

  