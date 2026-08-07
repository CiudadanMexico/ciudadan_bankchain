module.exports = {
  selectValidator(state) {
    const validators = state.getValidators()
    return validators[Math.floor(Math.random() * validators.length)]
  }
}
