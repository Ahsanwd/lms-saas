const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const created = (res, data = {}, message = 'Created') =>
  success(res, data, message, 201);

const error = (res, message = 'Error', statusCode = 400, errors = null) =>
  res.status(statusCode).json({ success: false, message, ...(errors && { errors }) });

const unauthorized = (res, message = 'Unauthorized') => error(res, message, 401);
const forbidden = (res, message = 'Forbidden') => error(res, message, 403);
const notFound = (res, message = 'Not found') => error(res, message, 404);
const serverError = (res, message = 'Internal server error') => error(res, message, 500);

module.exports = { success, created, error, unauthorized, forbidden, notFound, serverError };
